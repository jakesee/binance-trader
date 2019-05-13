import { IExchange, IAsset, IOrder, IOrderBook } from "./exchange/IExchange";
import { Bootstrap } from "./Bootstrap";
import { jStat } from "jstat";
import * as technical from "technicalindicators";
var EMA = technical.EMA;

// utility
import * as _ from 'lodash';
import * as tick from 'animation-loops';

// networking
import * as express from 'express';
import * as http from 'http';
import * as socketIO from 'socket.io';

class App {
    private _express:any;
    private _http:any;
    private _io:any;
    private _exchange:IExchange|null;

    constructor() {
        // binance
        this._exchange = new Bootstrap().getExchange();
        if(this._exchange == null) return;
        this._exchange.start();

        this._express = express();
        this._http = new http.Server(this._express);
        this._io = socketIO(this._http);

        this._http.listen(3001, () => {
            console.log('Listening on *:3001');        
        });

        this._express.use(express.static('../public_html'));
        // this._express.get('/book', (req:any, res:any) => {
        //     res.sendFile('book.html');
        // });

        this._io.on('connection', (socket:any) => {
            console.log('connected');
	        socket.emit('symbol', _.map(this._exchange!.getAssets(), (a:IAsset) => {return a.getSymbol(); }));
        });

        var votes:{[key:string]:Array<number>} = {};
        this._exchange.on('depth', (data) => {
            var ema = [0];
            var symbol = this._exchange!.getAssets()[data.symbol];
            var book = symbol.getOrderBook();
            var newVotes = _.filter(book.asks.concat(book.bids), (f:IOrder) => { return f.deltaQty > 0});
            if(newVotes.length > 0) {
                newVotes = _.map(newVotes, (m:IOrder) => { return m.price});
                newVotes = _.sortBy(newVotes);
                if(_.isEmpty(votes[data.symbol])) votes[data.symbol] = [];
                votes[data.symbol] = votes[data.symbol].concat(newVotes); // stick new votes to the back
                if(votes[data.symbol].length > 500) votes[data.symbol] = _.slice(votes[data.symbol], 0, 500);
                var mean = jStat.mean(votes[data.symbol]);
                var stdev = jStat.stdev(votes[data.symbol]);
                var length = votes[data.symbol].length;
                var emaInput = { 'values': votes[data.symbol], 'period': 24 };
                ema = _.takeRight(EMA.calculate(emaInput), 1); 
                if(data.symbol == "BTCUSDT") {
                    console.log(newVotes);
                    console.log("%s L:%d M:%d SD:%d EMA:%d", data.symbol, length, mean.toFixed(2), stdev.toFixed(2), ema);
                }
            }
        
            if(!symbol.isReady()) return;
        
            // calculate the average 
            // var bids = _.take(book.bids, 40);
            // var asks = _.take(book.asks, 40);
            // var bids = _.take(book.bids, 40);
            // var asks = _.take(book.asks, 40);
            var price = symbol.getTrade().price;
            var lowerBound = price / 1.02;
            var upperBound = price * 1.02;
            var bids = _.filter(book.bids, (bid:IOrder) => { return bid.price >= lowerBound });
            var asks = _.filter(book.asks, (ask:IOrder) => { return ask.price <= upperBound });

            // bid sentiment
            var fsBids = _.map(bids, (bid:IOrder) => { return +bid.quantity });
            var phighBids = jStat.percentile(fsBids, 0.85);
            var plowbids = jStat.percentile(fsBids, 0);
            var sentimentBids = _.filter(bids, (bid:IOrder) => { return plowbids < bid.quantity  && bid.quantity < phighBids }) ;

            // ask sentiment
            var fsAsks = _.map(asks, (ask:IOrder) => { return +ask.quantity });
            var phighAsks = jStat.percentile(fsAsks, 0.85);
            var plowAsks = jStat.percentile(fsAsks, 0);
            var sentimentAsks = _.filter(asks, (ask:IOrder) => { return plowAsks < ask.quantity  && ask.quantity < phighAsks }) ;

            // var orders40 = [].concat(bids).concat(asks);
            // var price = 0;
            // var count = 0;
            // var supply = { x:[], y:[] };
            // var demand = { x:[], y:[] };
            // _.each(bids, (bid) => {
            // 	demand.x.push(bid.quantity);
            // 	demand.y.push(bid.price);
            // })
            // _.each(asks, (ask) => {
            // 	supply.x.push(ask.quantity);
            // 	supply.y.push(ask.price);
            // });
            // console.log('supply', supply.x[0], supply.y[0], 'demand', demand.x[0], demand.y[0]);
            // _.each(orders40, (order) => {
            // 	price += Number(order.price) * Number(order.quantity);
            // 	count += Number(order.quantity);
            // });
            // var weightedAvergage = price / count;
            // var predict = weightedAvergage < symbol.trade.price ? 'fall' : 'rise';
            // console.log('wa', weightedAvergage, predict, price, count);
        
            var supply = this._getBookStats(asks, price);
            var demand = this._getBookStats(bids, price);
        
            var high = this._getPrice(demand.quantity, book.asks);
            var low = this._getPrice(supply.quantity, book.bids);
            // console.log(high, low, demand.quantity, supply.quantity);
        
            this._io.emit('depth', {
                symbol: data.symbol,
                demand: demand,
                supply: supply,
                price: price,
                emaDepth: ema[0],
                low: low,
                high: high,
                bidsQty: _.map(sentimentBids, (bid:IOrder) => { return bid.quantity }).concat(_.map(sentimentAsks, (ask:IOrder) => { return -ask.quantity })),
                bidsPrice: _.map(sentimentBids, (bid:IOrder) => { return bid.price }).concat(_.map(sentimentAsks, (ask:IOrder) => { return ask.price })),
                // sbidsQty: _.map(sentimentBids, (bid:IOrder) => { return -bid.quantity }),
                // sbidsPrice: _.map(sentimentBids, (bid:IOrder) => { return bid.price }),
            });

            // if(data.symbol == "BTCUSDT") console.log("%s UB:%d H:%d R:%d P:%d S:%d L:%d LB:%d -- BSD:%d ASD:%d -- GH:%d GS:%d", data.symbol, upperBound.toFixed(2), high.toFixed(2), supply.price.toFixed(2), price, demand.price.toFixed(2), low.toFixed(2), lowerBound.toFixed(2), demand.stdDev.toFixed(2), supply.stdDev.toFixed(2), (high / price).toFixed(4), (supply.price / price).toFixed(4));
            if(data.symbol == "BTCUSDT") console.log("%s P:%d BSD:%d ASD:%d, R:%d SD:%d, S:%d SD:%d", data.symbol, price, demand.stdDevSpotPrice.toFixed(2), supply.stdDevSpotPrice.toFixed(2), supply.meanPrice.toFixed(2), supply.stdDevMeanPrice.toFixed(2), demand.meanPrice.toFixed(2), demand.stdDevMeanPrice.toFixed(2));
        });
    }

    private _getPrice(quantity:number, offers:IOrder[]):number {
        var price = offers[0].price;
        for(var i = 0; i < offers.length; i++) {
            let offer = offers[i];
            if(offer.quantity >= quantity) {
                price = offer.price;
                break;
            }
            quantity -= offer.quantity;
        }

        return price;
    }

    private _getBookStats(orders:Array<IOrder>, spotPrice:number) {
        var result = { quantity: 0, meanPrice: 0, volume: 0, stdDevMeanPrice: 0, stdDevSpotPrice: 0 };
        _.each(orders, (order:IOrder) => {
            result.quantity += Number(order.quantity);
            result.volume += Number(order.price) * Number(order.quantity);
        });
        result.meanPrice = result.volume / result.quantity;

        var meanPriceVariance = 0;
        var spotPriceVariance = 0;
        _.each(orders, (order:IOrder) => {
            meanPriceVariance += Math.pow(order.price - result.meanPrice, 2) * order.quantity;
            spotPriceVariance += Math.pow(order.price - spotPrice, 2) * order.quantity;
        });
        var factor = 1 / (orders.length - 1) / (result.quantity / orders.length);
        result.stdDevMeanPrice = Math.sqrt(meanPriceVariance * factor);
        result.stdDevSpotPrice = Math.sqrt(spotPriceVariance * factor);
        return result;
    }
}

var app = new App();