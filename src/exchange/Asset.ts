import * as _ from "lodash";
import {IAsset, ITrade, POSITION} from "./IExchange";

export class Asset implements IAsset
{
    private _lastTime:number = 0;
    public klines:object[] = Array(); // up to 500 candles
    public ticker:any = {}; // latest ticker information
    private _trade:any = {}; // latest trade information
    private _tradeLowest:any = {}; // latest trade information
    private _tradeHighest:any = {}; // latest trade information
    private _book:{[key:string]:any} = {};
    private _bookBuffer:object[] = Array();

    constructor(private _symbol:string, public config:{[key:string]:any}) {
        
    }
    public getSymbol() {
        return this._symbol;
    }
    public getKlines():any {
        return this.klines;
    }
    public getTrade():any {
        return this._trade;
    }
    public getTradeLowest():ITrade {
        return this._tradeLowest;
    }
    public getTradeHighest():ITrade {
        return this._tradeHighest;
    }
    public getTicker():any {
        return this.ticker;
    }
    public getOrderBook():any {
        var book = {
			'lastUpdateId': this._book.lastUpdateId,
			'bids': _.orderBy(this._book.bids, ['price'], ['desc']),
			'asks': _.orderBy(this._book.asks, ['price'], ['asc'])
		};
		return book;
    }
    public getConfig():{[key:string]:any} {
        return this.config;
    }
    public setConfig(config:{[key:string]:any}, quantity:number, cost:number):void {
        this.config = config;
		if(this.config.bag.quantity == null) this.config.bag.quantity = quantity;
		if(this.config.bag.cost == null) this.config.bag.cost = cost;
		this.config.bag.quantity = Math.min(this.config.bag.quantity, quantity);
		if(this.config.bag.cost > 0) this.initDCA();
    }
    public setLastQueryTime(elapsedTime:number):void {
        this._lastTime = elapsedTime;
    }
    public isTimeToQuery(elapsedTime:number):boolean {
        var tooFrequent = (elapsedTime - this._lastTime) < this.config.frequency
        return (!tooFrequent && this.isReady());
    }
    public isReady():boolean {
        return (!_.isEmpty(this._trade)
			&& this.klines.length > 0
			&& !_.isEmpty(this.ticker)
			&& !_.isEmpty(this._book)
			&& this.config.bag.quantity != null
			&& this.config.bag.cost != null);
    }
    public initDCA():void {
        // TODO: this function should be initSellMode, and should be called when trader sucessfully bought asset
        this.config.bag.dca = _.cloneDeep(this.config.strategy.dca);
    }
    public canBuy(quantity:number, price:number):boolean {
        if(quantity * price < this.config.strategy.buy.minCost) {
			return false;
		} else return true;
    }
    public shouldSell():boolean {
        if(this.config.bag.quantity > 0 && this.config.bag.cost > 0) {
			return true;
		} else {
			return false;
		}
    }

    public updateTrade(trade:ITrade):void {
        this._trade = trade;

        // if we are trailing price, we want to record the lowest and highest price
		if((this.config.bag.POSITION & POSITION.TRAILING) > 0) {
			if(this._tradeLowest == null || (Number(trade.price) < Number(this._tradeLowest.price))) this._tradeLowest = trade;
			if(this._tradeHighest == null || (Number(trade.price) > Number(this._tradeHighest.price))) this._tradeHighest = trade;
		} else {
			this._tradeLowest = this._tradeHighest = trade;
		}	
    }
    public setBook(book:{[key:string]:any}):void {
        this._book = {
			'lastUpdateId': book.lastUpdateId,
			'bids': {},
			'asks': {}
		};
		_.each(book.bids, (bid:any) => {
			this._book.bids[bid[0]] = { price: Number(bid[0]), quantity: Number(bid[1]) };
		});
		_.each(book.asks, (ask:any) => {
			this._book.asks[ask[0]] = { price: Number(ask[0]), quantity: Number(ask[1]) };
		});

		_.each(this._bookBuffer, (b:object) => {
			this.updateBook(b);
		});
    }
    public updateBook(book:{[key:string]:any}):void {
        if(this._book == null) { // buffer the stream so that depth snapshot can be updated properly
			this._bookBuffer.push(book);
			return;
		}
		// drop update if old
		if(book.lastUpdateId <= this._book.lastUpdateId) return;
		this._book.lastUpdateId = book.lastUpdateId
		_.each(book.bidDepthDelta, (bid:any) => {
			var quantity = Number(bid.quantity);
			var price = bid.price; // typeof string
			if(quantity > 0) {
				this._book.bids[price] = { 'price': Number(price), 'quantity': quantity };
			} else {
				delete this._book.bids[price];
			}
		});
		_.each(book.askDepthDelta, (ask:any) => {
			var quantity = Number(ask.quantity);
			var price = ask.price; // typeof string
			if(quantity > 0) {
				this._book.asks[price] = { 'price': Number(price), 'quantity': quantity };
			} else {
				delete this._book.asks[price];
			}
		});
    }
}