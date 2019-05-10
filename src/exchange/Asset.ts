import * as log from 'loglevel';
import * as _ from "lodash";
import {IAsset, ITrade, POSITION, ISettings} from "./IExchange";

export class Asset implements IAsset
{
    private _lastTime:number = 0;
    public klines:object[] = Array(); // up to 500 candles
    public ticker:any = {}; // latest ticker information
    private _trade:any = {}; // latest trade information
    private _tradeLowest:any = {}; // latest trade information
    private _tradeHighest:any = {}; // latest trade information
    private _tradeBuyerWin:any = {}; // latest bought information
    private _tradeSellerWin:any = {}; // latest sold information
    private _book:{[key:string]:any} = {};
    private _bookBuffer:object[] = Array();

    constructor(private _symbol:string, private _settings:ISettings) {
        
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
    public getTradeSellerWin():ITrade {
        return this._tradeSellerWin;
    }
    public getTradeBuyerWin():ITrade {
        return this._tradeBuyerWin;
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
    public getSettings():ISettings {
        return this._settings;
    }
    public setSettings(settings:ISettings, quantity:number, cost:number):void {
        this._settings = settings;

        // if user did not specify bag properties, the use the value from exchange account
        this._settings.bag.quantity = this._settings.bag.quantity || quantity;
        this._settings.bag.cost = this._settings.bag.cost || cost;

        // if the user specified too much quantity, then use the quantity from exchange account
        this._settings.bag.quantity = Math.min(this._settings.bag.quantity, quantity);

        // then reset the DCA
        this.resetDCA();
    }
    public setLastQueryTime(elapsedTime:number):void {
        this._lastTime = elapsedTime;
    }
    public isTimeToQuery(elapsedTime:number):boolean {
        var tooFrequent = (elapsedTime - this._lastTime) < this._settings.frequency
        return (!tooFrequent && this.isReady());
    }
    public isReady():boolean {
        return (!_.isEmpty(this._trade)
			&& this.klines.length > 0
			&& !_.isEmpty(this.ticker)
			&& !_.isEmpty(this._book)
			&& this._settings.bag.quantity != null
			&& this._settings.bag.cost != null);
    }
    public resetDCA():void {
        // TODO: this function should be initSellMode, and should be called when trader sucessfully bought asset
        this._settings.bag.dca = _.cloneDeep(this._settings.strategy.dca);
    }
    public canBuy(quantity:number, price:number):boolean {
        return (quantity * price > this._settings.strategy.buy.minCost);
    }
    public shouldSell():boolean {
        return (this._settings.bag.quantity > 0 && this._settings.bag.cost > 0);
    }
    public clearOrder():void {
        this._settings.bag.position = POSITION.NONE;
        this._settings.bag.order = null;
    }
    public updateTrade(trade:ITrade):void {
        this._trade = trade;
        if(trade.maker == true) this._tradeBuyerWin = trade; // buyer win trade
        else this._tradeSellerWin = trade; // seller win trade

        // if we are trailing price, we want to record the lowest and highest price
		if((this._settings.bag.position & POSITION.TRAILING) > 0) {
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
        if(_.isEmpty(this._book)) { // buffer the stream so that depth snapshot can be updated properly
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

    public updateUser(data:any) {
        /* Update bag:
            config.bag.quantity --- quantity available for trading
            config.bag.cost --- weighted average cost of bag
        */
       log.info(data.side, data.orderId, data.executionType, data.lastTradeQuantity, data.lastTradePrice);
       var side = data.side;
       var price = Number(data.lastTradePrice);
       var lastTradeQuantity = Number(data.lastTradeQuantity);
       var bag = this._settings.bag;

       var totalQty, totalCost;
       if (side == 'BUY') {
           totalQty = lastTradeQuantity + bag.quantity;
           totalCost = (lastTradeQuantity * price) + (bag.quantity * bag.cost);
           var weightedAveragePrice = totalCost / totalQty;
           bag.cost = weightedAveragePrice;
           bag.quantity = totalQty;
       } else if (side == 'SELL') {
           totalQty = bag.quantity - lastTradeQuantity;
           totalCost = (bag.quantity * bag.cost) - (lastTradeQuantity * price);
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