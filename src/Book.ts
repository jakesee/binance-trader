import { IExchange, IAsset, IOrder } from "./exchange/IExchange";
import { Bootstrap } from "./Bootstrap";

// utility
import * as _ from 'lodash';
import * as tick from 'animation-loops';
import * as faststats from "fast-stats";
var fstats = faststats.Stats;

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

        this._exchange.on('depth', (data) => {
            var symbol = this._exchange!.getAssets()[data.symbol];
            var book = symbol.getOrderBook();
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
            var fsBids = new fstats().push(_.map(bids, (bid:IOrder) => { return +bid.quantity }));
            var phighBids = fsBids.percentile(85);
            var plowbids = fsBids.percentile(0);
            var sentimentBids = _.filter(bids, (bid:IOrder) => { return plowbids < bid.quantity  && bid.quantity < phighBids }) ;

            // ask sentiment
            var fsAsks = new fstats().push(_.map(asks, (ask:IOrder) => { return +ask.quantity }));
            var phighAsks = fsAsks.percentile(85);
            var plowAsks = fsAsks.percentile(0);
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
        
            var supply = { quantity: 0, price: 0, volume: 0 };
            var demand = { quantity: 0, price: 0, volume: 0 };
            _.each(bids, (order:IOrder) => {
                demand.quantity += Number(order.quantity);
                demand.volume += Number(order.price) * Number(order.quantity);
            })
            demand.price = demand.volume / demand.quantity; // support
            _.each(asks, (order:IOrder) => {
                supply.quantity += Number(order.quantity);
                supply.volume += Number(order.price) * Number(order.quantity);
            });
            supply.price = supply.volume / supply.quantity; //resistance
        
        
            var high = this._getPrice(demand.quantity, book.asks);
            var low = this._getPrice(supply.quantity, book.bids);
            // console.log(high, low, demand.quantity, supply.quantity);
        
            this._io.emit('depth', {
                symbol: data.symbol,
                demand: demand,
                supply: supply,
                price: price,
                low: low,
                high: high,
                bidsQty: _.map(sentimentBids, (bid:IOrder) => { return bid.quantity }).concat(_.map(sentimentAsks, (ask:IOrder) => { return -ask.quantity })),
                bidsPrice: _.map(sentimentBids, (bid:IOrder) => { return bid.price }).concat(_.map(sentimentAsks, (ask:IOrder) => { return ask.price })),
                // sbidsQty: _.map(sentimentBids, (bid:IOrder) => { return -bid.quantity }),
                // sbidsPrice: _.map(sentimentBids, (bid:IOrder) => { return bid.price }),
            });

            if(data.symbol == "BTCUSDT") console.log("%s UB:%d H:%d R:%d P:%d S:%d L:%d LB:%d -- GS:%d GS:%d", data.symbol, upperBound.toFixed(2), high.toFixed(2), supply.price.toFixed(2), price, demand.price.toFixed(2), low.toFixed(2), lowerBound.toFixed(2), (high / price).toFixed(4), (supply.price / price).toFixed(4));
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
}

var app = new App();