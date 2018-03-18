import * as log from 'loglevel';
import * as _ from 'lodash';
import * as wait from 'wait-for-stuff';
import * as EventEmitter from "events";

import { IExchange, IAsset } from "./IExchange";
import { Asset } from "./Asset";
import * as binance from 'binance';

export class Binance implements IExchange {

    private _events = new EventEmitter();
    private _assets:{[key:string]:Asset} = {}; // store the current state of the symbols
    private _rest:any;
    private _binanceWS:any;

    constructor(private _config:{[key:string]:any}) {
        this._rest = new binance.BinanceRest({
            key: this._config.binance.key,
            secret: this._config.binance.secret,
            timeout: 15000,
            recvWindow: 10000,
            disableBeautification: false,
        });
        this._binanceWS = new binance.BinanceWS(true);
    }
    start(): void {
        var symbols = this._config.symbols;
        _.each(symbols, (symbol:string) => {
            this._assets[symbol] = new Asset(symbol, this._config[symbol]);
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
        return new Promise((resolve, reject) => {
            this._rest.newOrder(order, (err:any, data:any) => {
                if (err) {
                    log.debug(err, data);
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
        return new Promise((resolve, reject) => {
            this._rest.newOrder(order, (err:any, data:any) => {
                if (err) {
                    log.debug(err, data);
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
                    console.log(err, data);
                    reject(null);
                } else {
                    resolve(data);
                }
            });
        });
    }
    private _loadTradingView(symbols:string[]) {
        _.each(symbols, (symbol:string) => {
            var config:{[key:string]:any} = this._assets[symbol].getConfig();
            // NOTE: 
            /*
                binance API this._rest.klines returns results in array index 0 to max 499, from oldest to newest candle
                technicalindicator macdInput also takes values from olderst to newest (close price), index 0 to max.
            */
            this._rest.klines({
                symbol: symbol,
                interval: config.indicator.kline.interval,
                limit: 500
            }, (err:any, data:any) => {
                if (err) {
                    console.log(err);
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
                    console.log(err);
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
            return streams.kline(symbol, this._assets[symbol].config.indicator.kline.interval)
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
            this._events.emit('user', streamData);
            console.log('USERDATASTREAM 1', streamData.symbol, streamData.eventType, streamData.executionType, streamData.orderStatus);
            if (!(this._assets.hasOwnProperty(streamData.symbol))) return;

            if (streamData.eventType === 'outboundAccountInfo') {
                // TODO: update account balances
            } else if (streamData.eventType === 'executionReport') {
                console.log('USERDATASTREAM 2', streamData.symbol, streamData.eventType, streamData.executionType, streamData.orderStatus);
                if (streamData.executionType == 'CANCELED') {
                    this._events.emit('CANCELED', streamData);
                } else if (streamData.executionType == 'NEW') {
                    this._events.emit('NEW', streamData);
                } else if (streamData.executionType == 'TRADE' && streamData.orderStatus == 'PARTIALLY_FILLED') {
                    console.log('USERDATASTREAM 3', streamData.symbol, streamData.eventType, streamData.executionType, streamData.orderStatus);
                    this._onUDSTradePartiallyFilled(streamData);
                } else if (streamData.executionType == 'TRADE' && streamData.orderStatus == 'FILLED') {
                    console.log('USERDATASTREAM 4', streamData.symbol, streamData.eventType, streamData.executionType, streamData.orderStatus);
                    this._onUDSTradeFilled(streamData);
                }
            }
        });
    }
    private _onUDSTradePartiallyFilled(data:any) {
        this._onUDSTrade(data);
        this._events.emit('PARTIALLY_FILLED', data);
    }
    private _onUDSTradeFilled(data:any) {
        this._onUDSTrade(data);
        this._events.emit('FILLED', data);
    }
    private _onUDSTrade(data:any) {
        /* Update bag:
            config.bag.quantity --- quantity available for trading
            config.bag.cost --- weighted average cost of bag
        */
        log.info(data.side, data.orderId, data.executionType, data.lastTradeQuantity, data.lastTradePrice);
        var symbol = data.symbol;
        var side = data.side;
        var price = Number(data.lastTradePrice);
        var lastTradeQuantity = Number(data.lastTradeQuantity);
        var bag = this._assets[data.symbol].config.bag;
        let totalQty;

        if (side == 'BUY') {
            totalQty = lastTradeQuantity + bag.quantity;
            var totalCost = (lastTradeQuantity * price) + (bag.quantity * bag.cost);
            var weightedAveragePrice = totalCost / totalQty;
            bag.cost = weightedAveragePrice;
            bag.quantity = totalQty;
        } else if (side == 'SELL') {
            totalQty = bag.quantity - lastTradeQuantity;
            var totalCost = (bag.quantity * bag.cost) - (lastTradeQuantity * price);
            if (totalQty <= 0) {
                bag.cost = 0;
                bag.quantity = 0;
            } else {
                var weightedAveragePrice = totalCost / totalQty;
                bag.cost = weightedAveragePrice;
                bag.quantity = totalQty;
            }
        }
    }
}