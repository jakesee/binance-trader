/**
 * TSymbol : Since Symbol is the reserve varaible, so this is named is TSymbol (Traidng symbol)
 */

import * as _ from "lodash";
import { ISymbol, IKLine } from './ISymbol';
import { BaseModal } from './BaseModal';
import { ISymbolConfig } from './ISymbolConfig';
import { IBook, IBookOrder, IBookDelta } from "./IBook";

class TSymbol extends BaseModal implements ISymbol {

    /**
     * Interface implementation
     */
    symbol: string
    lastTime: number;
    kline: IKLine;
    ticker: any;
    config: ISymbolConfig;
    trade; // TODO: create ITrade

    /**
     * local variables
     */
    private _bookByPrice; // this is a hash _bookByPrice[price] = { quantity: n, price: m } internal data structure does not follow interface
    private tradeLowest: IBookOrder;
    private tradeHighest: IBookOrder;
    private _bookBuffer: Array<IBookDelta>; // store incoming book delta updates before the book is set up

    readonly POSITIONS = {
        ANALYZING: 0,
        TRAILING: 0b000010010,
        // when bag is empty, switch to buy mode
        ANYBUY: 0b000000111, BUY: 0b000000001, BUYING: 0b000000010, BIDDING: 0b000000100,
        // when bag is not empty, switch to sell mode
        ANYSELL: 0b000111000, SELL: 0b000001000, SELLING: 0b000010000, ASKING: 0b000100000,
        // when current price fall belows average bag cost, switch to DCA mode
        ANYDCA: 0b111000000, DCA: 0b001000000, DCABUYING: 0b010000000, DCABIDDING: 0b100000000
    }

    constructor(config: ISymbolConfig, symbol: string) {
        super()
        this.config = config;
        this.symbol = symbol
    }

    /** */
    initDCA() {
        this.config.bag.dca = this.cloneDeep(this.config.strategy.dca);
    }

    /**
     * 
     * @param config 
     * @param quantity 
     * @param cost 
     */
    loadDefaultSymbolConfig(config, quantity, cost) {
        this.config = config;
        if (this.config.bag.quantity == null) this.config.bag.quantity = quantity;
        if (this.config.bag.cost == null) this.config.bag.cost = cost;
        this.config.bag.quantity = Math.min(this.config.bag.quantity, quantity);
        if (this.config.bag.cost > 0) this.initDCA();
    }

    /**
     * 
     * @param delta 
     * TODO: Need to refactor code
     */
    updateBook(delta: IBookDelta): void {

        // buffer the stream so that depth snapshot can be updated properly
        if (this._bookByPrice == null) {
            this._bookBuffer.push(delta);
            return;
        }

        // drop update if old
        if (delta.lastUpdateId <= this._bookByPrice.lastUpdateId) {
            return;
        }

        this._bookByPrice.lastUpdateId = delta.lastUpdateId;

        _.each(delta.bidDepthDelta, (bid) => {
            var quantity = Number(bid.quantity);
            var price = bid.price; // typeof string
            if (quantity > 0) {
                this._bookByPrice.bids[price] = { 'price': Number(price), 'quantity': quantity };
            } else {
                delete this._bookByPrice.bids[price];
            }
        });
        _.each(delta.askDepthDelta, (ask) => {
            var quantity = Number(ask.quantity);
            var price = ask.price; // typeof string
            if (quantity > 0) {
                this._bookByPrice.asks[price] = { 'price': Number(price), 'quantity': quantity };
            } else {
                delete this._bookByPrice.asks[price];
            }
        });
    }

    /**
     * 
     * @param boobk 
     */
    setBook(book: IBook) {

        this._bookByPrice = {
			'lastUpdateId': book.lastUpdateId,
			'bids': {},
			'asks': {}
		};

        _.each(book.bids, (bid) => {
            this._bookByPrice.bids[bid[0]] = { price: Number(bid[0]), quantity: Number(bid[1]) };
        });
        _.each(book.asks, (ask) => {
            this._bookByPrice.asks[ask[0]] = { price: Number(ask[0]), quantity: Number(ask[1]) };
        });
        _.each(this._bookBuffer, (b) => {
            this.updateBook(b);
        });
    }

    /** */
    getBook(): IBook {
        // sort the book only when we want to get, otherwise _bookByPrice can be unsorted
         var book = {
			'lastUpdateId': this._bookByPrice.lastUpdateId,
			'bids': _.orderBy(this._bookByPrice.bids, ['price'], ['desc']),
			'asks': _.orderBy(this._bookByPrice.asks, ['price'], ['asc'])
		};
		return book;
    }
    /**
     * 
     * @param trade 
     */
    updateTrade(trade: IBookOrder): void {

        this.trade = trade;

        // if we are trailing price, we want to record the lowest and highest price
        if (this.config.bag.POSITION && this.POSITIONS.TRAILING > 0) {
            if (this.tradeLowest == null || (Number(trade.price) < Number(this.tradeLowest.price))) this.tradeLowest = trade;
            if (this.tradeHighest == null || (Number(trade.price) > Number(this.tradeHighest.price))) this.tradeHighest = trade;
        } else {
            this.tradeLowest = this.tradeHighest = trade;
        }
    }

    /** */
    ready() {
        return (this.trade != null
            && Array.isArray(this.kline) && this.kline.length > 0
            && this.ticker != null
            && this._bookByPrice != null
            && this.config.bag.quantity != null
            && this.config.bag.cost != null);
    }

    /** */
    wantToSell() {
        if (this.config.bag.quantity > 0 && this.config.bag.cost > 0) {
            return true;
        } else {
            return false;
        }
    }

    /**
     * 
     * @param quantity 
     * @param price 
     */
    canBuy(quantity, price) {
        if (quantity * price < this.config.strategy.buy.minCost) {
            return false;
        } else return true;
    }
}