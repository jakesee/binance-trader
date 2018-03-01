'use strict';

var log = require('loglevel');
const _ = require('lodash');
var wait = require('wait-for-stuff');
var events = require('events');
var config = require('./configurator.js');
if(config === null) process.exit('config error');

var binance = require('binance');
const rest = new binance.BinanceRest({
	key: config.binance.key,
	secret: config.binance.secret,
	timeout: 15000,
	recvWindow: 10000,
	disableBeautification: false,
});
var Symbol = require('./symbol.js');

class Binance {
	constructor() {
		this.events = new events.EventEmitter();
		this._binanceWS = new binance.BinanceWS(true);
		this._portfolio = [];
		this._symbols = {}; // store all the symbols we are trading
	}

	on(event, callback) {
		this.events.on(event, callback);
	}

	run() {
		// one-time initialization of portfolio
		var symbols = config.symbols;
		this._portfolio = wait.for.promise(this._getPortfolio(symbols));
		var portfolio = _.reduce(this._portfolio, (o, p) => { o[p.asset + 'BTC'] = p; return o; }, {});
		_.each(symbols, (symbol) => {			
			this._symbols[symbol] = new Symbol(symbol, config[symbol]);
			var quantity = Math.trunc(Number(portfolio[symbol].free));
			var cost = Number(portfolio[symbol].weightedAveragePrice);
			this._symbols[symbol].loadConfig(config[symbol], quantity, cost);
			
			log.info(this._symbols[symbol].symbol, this._symbols[symbol].config.bag.quantity, this._symbols[symbol].config.bag.cost, this._symbols[symbol].config.bag.position);
		});

		// one-time fetch klines and order booK (depth) for all symbols
		this._loadTradingView(symbols);

		// setup real-time streams
		this._loadTickerStream(symbols); // collect latest price data from websocket
		this._loadTradeStream(symbols);
		this._loadKlineStream(symbols); // collect latest kline data from websocket
		this._loadDepthStream(symbols);
		this._loadUserDataStream();
	}

	_getPortfolio(symbols) {
		return new Promise((resolve, reject) => {
			rest.account((err, data) => {
				var portfolio = [];
				if(err) {
					console.log(err);
				} else {
					var balances = _.filter(data.balances, (b) => { return symbols.includes(b.asset+'BTC'); });
					_.each(balances, (b) => {
						if(b.asset == 'BTC') return true; // skip BTC
						b.weightedAveragePrice = 0;
						b.totalTradeValue = 0;
						b.totalTradeQty = 0;
						portfolio.push(b);
						var tradeBNB = [];
						var tradeBTC = [];
						var totalQuantity = Math.trunc(Number(b.free) + Number(b.locked));
						tradeBTC = wait.for.promise(rest.myTrades(b.asset+'BTC'));
						if(b.asset != 'BNB') {
							tradeBNB = wait.for.promise(rest.myTrades(b.asset+'BNB'));
							if(!Array.isArray(tradeBNB)) tradeBNB = []; // some coins does not have BNB pairs
						}
						var trades = _.orderBy(tradeBTC.concat(tradeBNB), ['time'], ['desc']);
						var totalTradeValue = 0;
						var totalTradeQty = 0;
						_.each(trades, (trade) => {
							var tradeQty = Number(trade.qty);
							var tradePrice = Number(trade.price);
							var modifier = (trade.isBuyer == true ? 1 : -1);
							totalTradeQty += tradeQty * modifier;
							// totalTradeQty += trade.commissionAsset == b.asset ? Number(trade.commission) : 0; // subtract the commission
							totalTradeValue += tradeQty * tradePrice * modifier;
							if(totalTradeQty >= totalQuantity) {
								b.weightedAveragePrice = Math.max(0, totalTradeValue / Math.min(totalTradeQty, totalQuantity));
								b.totalTradeValue = totalTradeValue;
								b.totalTradeQty = Math.min(totalTradeQty, totalQuantity);
								return false;
							}
						});
					});
				}
				this.events.emit('portfolio', portfolio);
				resolve(portfolio);
			});
		});
	}

	_loadTradingView(symbols) {
		_.each(symbols, (symbol) => {
			
			var config = this._symbols[symbol].config;
			// NOTE: 
			/*
				binance API rest.klines returns results in array index 0 to max 499, from oldest to newest candle
				technicalindicator macdInput also takes values from olderst to newest (close price), index 0 to max.
			*/
			rest.klines({symbol: symbol, interval: config.indicator.kline.interval, limit:500}, (err, data) => {
				if(err) {
					console.log(err);
				} else {
					// for new coins, if not enough 500 klines, then remaining are undefined
					this._symbols[symbol].kline = _.filter(data, (d) => { return d != undefined });
					log.info(symbol, 'kline', this._symbols[symbol].kline.length);
				}
			});

			rest.depth({symbol: symbol, limit: 100 }, (err, data) => {
				if(err) {
					console.log(err);
				} else {
					this._symbols[symbol].setBook(data);
					log.info(symbol, 'book');
				}
			});
		});
	}

	_loadTickerStream(symbols) {
		const streams = this._binanceWS.streams;
		var assets = _.map(symbols, (symbol) => { return streams.ticker(symbol) });
		this._binanceWS.onCombinedStream(assets, (streamEvent) => {
			this._symbols[streamEvent.data.symbol].ticker = streamEvent.data;
			this.events.emit('ticker', streamEvent.data);
		});
	}

	_loadTradeStream(symbols) {
		const streams = this._binanceWS.streams;
		var assets =_.map(symbols, (symbol) => { return streams.trade(symbol); });
		this._binanceWS.onCombinedStream(assets, (streamEvent) => {
			this._symbols[streamEvent.data.symbol].updateTrade(streamEvent.data);
			this.events.emit('trade', streamEvent.data);
		});
	}

	_loadKlineStream(symbols) {
		const streams = this._binanceWS.streams;
		var assets = _.map(symbols, (symbol) => { return streams.kline(symbol, this._symbols[symbol].config.indicator.kline.interval) });
		this._binanceWS.onCombinedStream(assets, (streamEvent) => {
			var symbol = streamEvent.data.symbol;
			if(symbol in this._symbols && this._symbols[symbol].ready()) {
				var thisKline = this._translateKline(streamEvent.data.kline);
				var lastKline = _.last(this._symbols[symbol].kline);
				if(lastKline.openTime == thisKline.openTime) { // update kline
					this._symbols[symbol].kline[this._symbols[symbol].kline.length - 1] = thisKline;
				} else { // add new kline and remove the oldest (first in the array) one
					 // new coins will not have 500 klines and we can just continue to append klines until 500 max reached
					if(this._symbols[symbol].kline.length >= 500) this._symbols[symbol].kline.shift();
					this._symbols[symbol].kline.push(thisKline);
				}
			}
		});
	}
	_translateKline(kline) {
		return {
			'openTime': kline.startTime,
			'open': kline.open,
			'high': kline.high,
			'low': kline.low,
			'close': kline.close,
			'volume': kline.volume,
			'closeTime': kline.endTime,
			'quoteAssetVolume': kline.quoteVolume,
			'trades': kline.trades,
			'takerBaseAssetVolume': null,
			'takerQuoteAssetVolume': null,
		};
	}

	_loadDepthStream(symbols) {
		const streams = this._binanceWS.streams;
		var assets =_.map(symbols, (symbol) => { return streams.depth(symbol); });
		this._binanceWS.onCombinedStream(assets, (streamEvent) => {
			this._symbols[streamEvent.data.symbol].updateBook(streamEvent.data);
			this.events.emit('depth', streamEvent.data);
		});
	}

	_loadUserDataStream(symbols) {
		this._binanceWS.onUserData(rest, (streamData) => {
			this.events.emit('user', streamData);
			console.log('USERDATASTREAM 1', streamData.symbol, streamData.eventType, streamData.executionType, streamData.orderStatus);
			if(!(this._symbols.hasOwnProperty(streamData.symbol))) return;

			if(streamData.eventType === 'outboundAccountInfo') {
				// TODO: update account balances
			} else if(streamData.eventType === 'executionReport') {
				console.log('USERDATASTREAM 2', streamData.symbol, streamData.eventType, streamData.executionType, streamData.orderStatus);
				if(streamData.executionType == 'CANCELED') {
					this.events.emit('CANCELED', streamData);
				} else if(streamData.executionType == 'NEW') {
					this.events.emit('NEW', streamData);
				} else if(streamData.executionType == 'TRADE' && streamData.orderStatus == 'PARTIALLY_FILLED') {
					console.log('USERDATASTREAM 3', streamData.symbol, streamData.eventType, streamData.executionType, streamData.orderStatus);
					this._onUDSTradePartiallyFilled(streamData);
				} else if(streamData.executionType == 'TRADE' && streamData.orderStatus == 'FILLED') {
					console.log('USERDATASTREAM 4', streamData.symbol, streamData.eventType, streamData.executionType, streamData.orderStatus);
					this._onUDSTradeFilled(streamData);
				}
			}
		});
	}

	_onUDSTradePartiallyFilled(data) {
		this._onUDSTrade(data);
		this.events.emit('PARTIALLY_FILLED', data);
	}
	_onUDSTradeFilled(data) {
		
		this._onUDSTrade(data);
		this.events.emit('FILLED', data);
	}
	_onUDSTrade(data) {
		/* Update bag:
			config.bag.quantity --- quantity available for trading
			config.bag.cost --- weighted average cost of bag
		*/
		log.info(data.side, data.orderId, data.executionType, data.lastTradeQuantity, data.lastTradePrice);
		var symbol = data.symbol;
		var side = data.side;
		var price = Number(data.lastTradePrice);
		var lastTradeQuantity = Number(data.lastTradeQuantity);
		var bag = this._symbols[data.symbol].config.bag;
		if(side == 'BUY') {
			var totalQty = lastTradeQuantity + bag.quantity;
			var totalCost = (lastTradeQuantity * price) + (bag.quantity * bag.cost);
			var weightedAveragePrice = totalCost / totalQty;
			bag.cost = weightedAveragePrice;
			bag.quantity = totalQty;
		} else if (side == 'SELL') {
			var totalQty = bag.quantity - lastTradeQuantity;
			var totalCost = (bag.quantity * bag.cost) - (lastTradeQuantity * price);
			if(totalQty <= 0) {
				bag.cost = 0;
				bag.quantity = 0;
			} else {
				var weightedAveragePrice = totalCost / totalQty;
				bag.cost = weightedAveragePrice;
				bag.quantity = totalQty;
			}
		}
	}

	getSymbols() {
		return this._symbols;
	}

	newBuyLimit(symbol, quantity, bid) {
		var order = {
			'symbol': symbol,
			'side': 'BUY',
			'type': 'LIMIT', // can become a MARKET TAKER order
			'timeInForce': 'GTC',
			'quantity': quantity,
			'price': bid,
			'newOrderRespType': 'FULL',
			'timestamp': Date.now()
		};
		return new Promise((resolve, reject) => {
			rest.newOrder(order, (err, data) => {
				if(err) {
					console.log(err, data);
					reject(null);
				} else {
					resolve(data);
				}
			});
		});
	}

	newSellLimit(symbol, quantity, bid) {
		var order = {
			'symbol': symbol,
			'side': 'SELL',
			'type': 'LIMIT', // can become a MARKET TAKER order
			'timeInForce': 'GTC',
			'quantity': quantity,
			'price': bid,
			'newOrderRespType': 'FULL',
			'timestamp': Date.now()
		};
		return new Promise((resolve, reject) => {
			rest.newOrder(order, (err, data) => {
				if(err) {
					console.log(err, data);
					reject(null);
				} else {
					resolve(data);
				}
			});
		});
	}

	cancelOrder(symbol, orderId) {
		var order = {
			'symbol': symbol,
			'orderId': orderId,
			'timestamp': Date.now()
		};
		return new Promise((resolve, reject) => {
			rest.cancelOrder(order, (err, data) => {
				if(err) {
					console.log(err, data);
					reject(null);
				} else {
					resolve(data);
				}
			});
		});
	}
}

module.exports = Binance;