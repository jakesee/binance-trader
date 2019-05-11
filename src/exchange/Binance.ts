import * as log from 'loglevel';
import * as _ from 'lodash';
import * as wait from 'wait-for-stuff';
import * as EventEmitter from "events";

import { IExchange, IAsset, ISymbolInfo } from "./IExchange";
import { Asset } from "./Asset";
import * as binance from 'binance';
import { exists } from 'fs';

export class Binance implements IExchange {

    private _events = new EventEmitter();
    private _assets:{[key:string]:Asset} = {}; // store the current state of the symbols
    private _rest:any;
    private _binanceWS:any;
    private _symbolInfo:{[key:string]:ISymbolInfo} = {};

    constructor(private _config:{[key:string]:any}) {
        this._rest = new binance.BinanceRest({
            key: this._config.binance.key,
            secret: this._config.binance.secret,
            timeout: 15000,
            recvWindow: 10000,
            disableBeautification: false,
            handleDrift: true
        });
        this._binanceWS = new binance.BinanceWS(true);
    }
    public start(): void {
        var symbols = this._config.symbols;
        var symbolInfo:{[key:string]:ISymbolInfo} = wait.for.promise(this._loadSymbolsInfo(symbols)); // cache the symbol info
        var portfolio = wait.for.promise(this._getPortfolio(symbols));
        _.each(symbols, (symbol:string) => {
            this._config[symbol].info = symbolInfo[symbol];
            this._assets[symbol] = new Asset(symbol, this._config[symbol]);
            var quantity = Math.trunc(Number(portfolio[symbol].free));
			var cost = Number(portfolio[symbol].weightedAveragePrice);
			this._assets[symbol].setSettings(this._config[symbol], quantity, cost);
			
            log.info(this._assets[symbol].getSymbol(), this._assets[symbol].getSettings().bag.quantity, this._assets[symbol].getSettings().bag.cost, this._assets[symbol].getSettings().bag.position);
        });

        // setup real-time streams
        this._loadTickerStream(symbols); // collect latest price data from websocket
        this._loadTradeStream(symbols);
        this._loadKlineStream(symbols); // collect latest kline data from websocket
        this._loadDepthStream(symbols);
        this._loadUserDataStream();

        // one-time fetch klines and order booK (depth) for all symbols
        this._loadTradingView(symbols);
    }
    public getAssets():{[key:string]:IAsset} {
        return this._assets;
    }
    public on(event:string, callable:{(arg:any):void}) : void {
        this._events.on(event, callable);
    }
    public placeSellLimit(symbol:string, quantity:number, ask:number) {
        var order = {
            'symbol': symbol,
            'side': 'SELL',
            'type': 'LIMIT', // can become a MARKET TAKER order
            'timeInForce': 'GTC',
            'quantity': quantity,
            'price': ask,
            'newOrderRespType': 'FULL',
            'timestamp': Date.now()
        };
        log.debug("action=placeSellLimit, asset=%s, quantity=%d, price=%d", symbol, quantity, ask);
        return new Promise((resolve, reject) => {
            this._rest.newOrder(order, (err:any, data:any) => {
                if (err) {
                    log.debug("action=placeSellLimit, asset=%s, quantity=%d, price=%d, error=%s", symbol, quantity, ask, data.msg);
                    reject(null);
                } else {
                    resolve(data);
                }
            });
        });
    }
    public placeBuyLimit(symbol:string, quantity:number, bid:number) {
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
        log.debug("action=placeBuyLimit, asset=%s, quantity=%d, price=%d", symbol, quantity, bid);
        return new Promise((resolve, reject) => {
            this._rest.newOrder(order, (err:any, data:any) => {
                if (err) {
                    log.debug("action=placeBuyLimit, asset=%s, quantity=%d, price=%d, error=%s", symbol, quantity, bid, data.msg);
                    reject(null);
                } else {
                    resolve(data);
                }
            });
        });
    }
    public cancelOrder(symbol:string, orderId:number) {
        var order = {
            'symbol': symbol,
            'orderId': orderId,
            'timestamp': Date.now()
        };
        return new Promise((resolve, reject) => {
            this._rest.cancelOrder(order, (err:any, data:any) => {
                if (err) {
                    log.debug(err, data);
                    reject(null);
                } else {
                    resolve(data);
                }
            });
        });
    }
    private _loadSymbolsInfo(symbols:Array<string>) {
        return new Promise((resolve, reject) => {
            this._rest.exchangeInfo((err:any, data:any) => {
                if(err) {
                    log.debug(err);
                    reject(err);
                }
                var symbol = _.filter(data.symbols, (Symbol:{symbol:string}) => _.indexOf(symbols, Symbol.symbol) >= 0)
                var info:{[key:string]:ISymbolInfo} = {};
                _.each(symbol, (s:any) => {
                    var lotsize = _.find(s.filters, (f:any) => f.filterType == 'LOT_SIZE')
                    info[s.symbol] = {
                        symbol: s.symbol,
                        minQty: Number(lotsize.minQty),
                        maxQty: Number(lotsize.maxQty),
                        quotePrecision: Number(s.quotePrecision)
                    }
                });
                resolve(info);
            });
        })
    }
    private _getPortfolio(symbols:Array<string>) {
		return new Promise((resolve, reject) => {
			this._rest.account((err:any, data:any) => {
				var portfolio:{[key:string]:any} = {};
				if(err) {
					log.debug(err);
				} else {
                    var balances = _.filter(data.balances, (b:any) => { return symbols.indexOf(b.asset + this._config.quote) > -1 }); // TODO: should be allowed to use Array.includes()
					_.each(balances, (b:any) => {
						if(b.asset == this._config.quote) return true; // skip quote currency
						b.weightedAveragePrice = 0;
						b.totalTradeValue = 0;
                        b.totalTradeQty = 0;
                        portfolio[b.asset + this._config.quote] = b;
						var tradeBNB = [];
						var tradeBTC = [];
						var totalQuantity = Math.trunc(Number(b.free) + Number(b.locked)); // TODO: 
						tradeBTC = wait.for.promise(this._rest.myTrades(b.asset + this._config.quote));
						if(b.asset != 'BNB') {
							tradeBNB = wait.for.promise(this._rest.myTrades(b.asset+'BNB'));
							if(!Array.isArray(tradeBNB)) tradeBNB = []; // some coins does not have BNB pairs
						}
						var trades = _.orderBy(tradeBTC.concat(tradeBNB), ['time'], ['desc']);
						var totalTradeValue = 0;
						var totalTradeQty = 0;
						_.each(trades, (trade:any) => {
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
				this._events.emit('portfolio', portfolio);
				resolve(portfolio);
			});
		});
	}
    private _loadTradingView(symbols:string[]) {
        _.each(symbols, (symbol:string) => {
            var config:{[key:string]:any} = this._assets[symbol].getSettings();
            // NOTE: 
            /*
                binance API this._rest.klines returns results in array index 0 to max 499, from oldest to newest candle
                technicalindicator macdInput also takes values from oldest to newest (close price), index 0 to max.
            */
            this._rest.klines({
                symbol: symbol,
                interval: config.indicator.kline.interval,
                limit: 500
            }, (err:any, data:any) => {
                if (err) {
                    log.debug(err);
                } else {
                    // for new coins, if not enough 500 klines, then remaining are undefined
                    this._assets[symbol].klines = _.filter(data, (d:any) => {
                        return d != undefined;
                    });
                    log.info(symbol, 'kline', this._assets[symbol].getKlines().length);
                }
            });

            this._rest.depth({
                symbol: symbol,
                limit: 100
            }, (err:any, data:any) => {
                if (err) {
                    log.debug(err);
                } else {
                    this._assets[symbol].setBook(data);
                    log.info(symbol, 'book');
                }
            });
        });
    }
    private _loadTickerStream(symbols:string[]) {
        const streams = this._binanceWS.streams;
        var assets = _.map(symbols, (symbol:string) => {
            return streams.ticker(symbol)
        });
        this._binanceWS.onCombinedStream(assets, (streamEvent:any) => {
            this._assets[streamEvent.data.symbol].ticker = streamEvent.data;
            this._events.emit('ticker', streamEvent.data);
        });
    }
    private _loadTradeStream(symbols:string[]) {
        const streams = this._binanceWS.streams;
        var assets = _.map(symbols, (symbol:string) => {
            return streams.trade(symbol);
        });
        this._binanceWS.onCombinedStream(assets, (streamEvent:any) => {
            this._assets[streamEvent.data.symbol].updateTrade(streamEvent.data);
            this._events.emit('trade', streamEvent.data);
        });
    }
    private _loadKlineStream(symbols:string[]) {
        const streams = this._binanceWS.streams;
        var assets = _.map(symbols, (symbol:string) => {
            return streams.kline(symbol, this._assets[symbol].getSettings().indicator.kline.interval)
        });
        this._binanceWS.onCombinedStream(assets, (streamEvent:any) => {
            var symbol = streamEvent.data.symbol;
            if (symbol in this._assets && this._assets[symbol].isReady()) {
                var thisKline = this._translateKline(streamEvent.data.kline);
                var lastKline = _.last(this._assets[symbol].klines);
                if (lastKline.openTime == thisKline.openTime) { // update kline
                    this._assets[symbol].klines[this._assets[symbol].klines.length - 1] = thisKline;
                } else { // add new kline and remove the oldest (first in the array) one
                    // new coins will not have 500 klines and we can just continue to append klines until 500 max reached
                    if (this._assets[symbol].klines.length >= 500) this._assets[symbol].klines.shift();
                    this._assets[symbol].klines.push(thisKline);
                }
            }
        });
    }
    private _translateKline(kline:{[key:string]:any}) {
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
    private _loadDepthStream(symbols:string[]) {
        const streams = this._binanceWS.streams;
        var assets = _.map(symbols, (symbol:string) => {
            return streams.depth(symbol);
        });
        this._binanceWS.onCombinedStream(assets, (streamEvent:any) => {
            this._assets[streamEvent.data.symbol].updateBook(streamEvent.data);
            this._events.emit('depth', streamEvent.data);
        });
    }
    private _loadUserDataStream() {
        this._binanceWS.onUserData(this._rest, (streamData:any) => {
            let symbol = streamData.symbol;
            this._events.emit('user', streamData);
            if (!(this._assets.hasOwnProperty(symbol))) return;

            if (streamData.eventType === 'outboundAccountInfo') {
                // TODO: update actscount balances
            } else if (streamData.eventType === 'executionReport') {
                if (streamData.executionType == 'CANCELED') {
                    this._events.emit('CANCELED', streamData);
                } else if (streamData.executionType == 'NEW') {
                    this._events.emit('NEW', streamData);
                } else if (streamData.executionType == 'TRADE' && streamData.orderStatus == 'PARTIALLY_FILLED') {
                    this._assets[symbol].updateUser(streamData);
                    this._events.emit('PARTIALLY_FILLED', streamData);
                } else if (streamData.executionType == 'TRADE' && streamData.orderStatus == 'FILLED') {
                    this._assets[symbol].updateUser(streamData);
                    this._events.emit('FILLED', streamData);
                }
            }
        });
    }
}