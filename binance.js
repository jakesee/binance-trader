'use strict';
var _ = require('lodash');
var columnify = require('columnify');
var wait = require('wait-for-stuff');
var config = require('./configurator.js')();
if(config == null) process.exit('config error');

const WebSocket = require('ws');
var io = require('socket.io');
var tick = require('animation-loops');
var events = require('events');

var binance = require('binance');
const rest = new binance.BinanceRest({
	key: config.binance.key,
	secret: config.binance.secret,
	timeout: 15000,
	recvWindow: 10000,
	disableBeautification: false,
});
var Symbol = require('./symbol.js');

module.exports = function(io) {
	var _io = io;
	var _portfolio = [];
	var _symbols = {}; // store all the symbols we are trading
	this.events = new events.EventEmitter();

	_io.on('connection', (socket) => {
		socket.emit('portfolio', _portfolio);
		console.log('connected');
	});
	_io.on('disconnect', (socket) => {
		console.log('disconnected');
	});

	this.run = function() {

		// one-time initialization of portfolio
		var symbols = config.symbols;
		_portfolio = wait.for.promise(this.getPortfolio(symbols));
		_io.sockets.emit('portfolio', _portfolio);
		var portfolio = _.reduce(_portfolio, (o, p) => { o[p.asset + 'BTC'] = p; return o; }, {});
		_.each(symbols, (symbol) => {			
			_symbols[symbol] = new Symbol(symbol, config[symbol]);
			var quantity = Math.trunc(Number(portfolio[symbol].free));
			var cost = Number(portfolio[symbol].weightedAveragePrice);
			_symbols[symbol].loadConfig(config[symbol], quantity, cost);
			
			console.log(_symbols[symbol].symbol, _symbols[symbol].config); 
		});

		// one-time fetch klines and order booK (depth) for all symbols
		this.loadTradingView(symbols);

		// setup real-time streams
		const binanceWS = new binance.BinanceWS(true);
		this.loadTickerStream(binanceWS, symbols); // collect latest price data from websocket
		this.loadTradeStream(binanceWS, symbols);
		this.loadKlineStream(binanceWS, symbols); // collect latest kline data from websocket
		this.loadDepthStream(binanceWS, symbols);
		this.loadUserDataStream(binanceWS);
	}

	this.loadTradingView = function(symbols) {
		_.each(symbols, (symbol) => {
			
			var config = _symbols[symbol].config;
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
					_symbols[symbol].kline = _.filter(data, (d) => { return d != undefined });
				}
			});

			rest.depth({symbol: symbol, limit: 100 }, (err, data) => {
				if(err) {
					console.log(err);
				} else {
					_symbols[symbol].setBook(data);
				}
			});
		});
	}

	this.loadTickerStream = function(binanceWS, symbols) {
		const streams = binanceWS.streams;
		var assets = _.map(symbols, (symbol) => { return streams.ticker(symbol) });
		binanceWS.onCombinedStream(assets, (streamEvent) => {
			_symbols[streamEvent.data.symbol].ticker = streamEvent.data;
			_io.sockets.emit('ticker', streamEvent.data);
		});
	}

	this.loadTradeStream = function(binanceWS, symbols) {
		const streams = binanceWS.streams;
		var assets =_.map(symbols, (symbol) => { return streams.trade(symbol); });
		binanceWS.onCombinedStream(assets, (streamEvent) => {
			_symbols[streamEvent.data.symbol].updateTrade(streamEvent.data);
		});
	}

	this.loadKlineStream = function(binanceWS, symbols) {
		const streams = binanceWS.streams;
		var assets = _.map(symbols, (symbol) => { return streams.kline(symbol, _symbols[symbol].config.indicator.kline.interval) });
		binanceWS.onCombinedStream(assets, (streamEvent) => {
			var symbol = streamEvent.data.symbol;
			if(symbol in _symbols && _symbols[symbol].ready()) {
				var thisKline = this.translateKline(streamEvent.data.kline);
				var lastKline = _.last(_symbols[symbol].kline);
				if(lastKline.openTime == thisKline.openTime) { // update kline
					_symbols[symbol].kline[_symbols[symbol].kline.length - 1] = thisKline;
				} else { // add new kline and remove the oldest (first in the array) one
					 // new coins will not have 500 klines and we can just continue to append klines until 500 max reached
					if(_symbols[symbol].kline.length >= 500) _symbols[symbol].kline.shift();
					_symbols[symbol].kline.push(thisKline);
				}
			}
		});
	}

	this.loadDepthStream = function(binanceWS, symbols) {
		const streams = binanceWS.streams;
		var assets =_.map(symbols, (symbol) => { return streams.depth(symbol); });
		binanceWS.onCombinedStream(assets, (streamEvent) => {
			_symbols[streamEvent.data.symbol].updateBook(streamEvent.data);
		});
	}

	this.loadUserDataStream = function(binanceWS) {
		binanceWS.onUserData(rest, (streamData) => {

			if(!(_symbols.hasOwnProperty(streamData.symbol))) return;

			if(streamData.eventType === 'outboundAccountInfo') {
				// TODO: update account balances
			} else if(streamData.eventType === 'executionReport') {
				if(streamData.executionType == 'CANCELED') {
					this.events.emit('CANCELED', streamData);
				} else if(streamData.executionType == 'NEW') {
					this.events.emit('NEW', streamData);
				} else if(streamData.executionType == 'TRADE' && streamData.orderStatus == 'PARTIALLY_FILLED') {
					this._onUDSTradePartiallyFilled(streamData);
				} else if(streamData.executionType == 'TRADE' && streamData.orderStatus == 'FILLED') {
					this._onUDSTradeFilled(streamData);
				}
			}
		});
	}
	this._onUDSTradePartiallyFilled = function(data) {
		this._onUDSTrade(data);
		this.events.emit('PARTIALLY_FILLED', data);
	}
	this._onUDSTradeFilled = function(data) {
		
		this._onUDSTrade(data);
		this.events.emit('FILLED', data);
	}
	this._onUDSTrade = function(data) {
		/* Update bag:
			config.bag.quantity --- quantity available for trading
			config.bag.cost --- weighted average cost of bag
		*/
		var symbol = data.symbol;
		var side = data.side;
		var price = Number(data.lastTradePrice);
		var lastTradeQuantity = Number(data.lastTradeQuantity);
		var bag = _symbols[data.symbol].config.bag;
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

	this.getPortfolio = function(symbols) {
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
				resolve(portfolio);
			});
		});
	}

	this.translateKline = function(kline) {
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

	this.getSymbols = function() {
		return _symbols;
	}

	this.newBuyLimit = function(symbol, quantity, bid) {
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

	this.newSellLimit = function(symbol, quantity, bid) {
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

	this.cancelOrder = function(symbol, orderId) {
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






