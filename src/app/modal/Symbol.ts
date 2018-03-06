/**
 * TSymbol : Since Symbol is the reserve varaible, so this is named is TSymbol (Traidng symbol)
 */

import * as _ from "lodash";
import { ISymbol, IKLine } from './ISymbol';
import { BaseModal } from './BaseModal';
import { ISymbolConfig } from './ISymbolConfig';
import { IBook, IBookRecord } from "./IBook";
import { POSITIONS } from "../constants/Constant";

class TSymbol extends BaseModal implements ISymbol {

    /**
     * Interface implementation
     */
    symbol: string
    lastTime: number;
    kline: IKLine;
    ticker: any;
    tradeNow: String;
    bookBuffer: Array<any>;
    config: ISymbolConfig;

    /**
     * local variables
     */
    private _book: IBook;
    private trade: IBookRecord;
    private tradeLowest: IBookRecord;
    private tradeHighest: IBookRecord;



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
     * @param b 
     * TODO: Need to refactor code
     */
    updateBook(b: IBook): void {

        // buffer the stream so that depth snapshot can be updated properly
        if (this._book == null) {
            this.bookBuffer.push(b);
            return;
        }

        // drop update if old
        if (b.lastUpdateId <= this._book.lastUpdateId) {
            return;
        }

        this._book.lastUpdateId = b.lastUpdateId

        _.each(b.bidDepthDelta, (bid) => {

            var quantity = Number(bid.quantity);
            var price = bid.price; // typeof string
            if (quantity > 0) {
                this._book.bids[price] = { 'price': Number(price), 'quantity': quantity };
            } else {
                delete this._book.bids[price];
            }
        });
        _.each(b.askDepthDelta, (ask) => {
            var quantity = Number(ask.quantity);
            var price = ask.price; // typeof string
            if (quantity > 0) {
                this._book.asks[price] = { 'price': Number(price), 'quantity': quantity };
            } else {
                delete this._book.asks[price];
            }
        });

        //TODO: need to verify this
        this._book.bids = _.orderBy(this._book.bids, ['price'], ['desc']);
        this._book.asks = _.orderBy(this._book.asks, ['price'], ['desc']);
    }

    /**
     * 
     * @param book;
     */
    initBookObj(book): IBook {
        return {
            lastUpdateId: book.lastUpdateId,
            bids: { price: 0, quantity: 0 },
            asks: { price: 0, quantity: 0 },
            askDepthDelta: {},
            bidDepthDelta: {}
        };
    }

    /**
     * 
     * @param boobk 
     */
    setBook(b: IBook) {

        this._book = this.initBookObj(b);

        _.each(b.bids, (bid) => {
            this._book.bids[bid[0]] = { price: Number(bid[0]), quantity: Number(bid[1]) };
        });
        _.each(b.asks, (ask) => {
            this._book.asks[ask[0]] = { price: Number(ask[0]), quantity: Number(ask[1]) };
        });
        _.each(this.bookBuffer, (b) => {
            this.updateBook(b);
        });
    }

    /** */
    getBook(): IBook {
        return this._book;
    }
    /**
     * 
     * @param trade 
     */
    updateTrade(trade: IBookRecord): void {

        this.trade = trade;

        // if we are trailing price, we want to record the lowest and highest price
        if (this.config.bag.POSITION && POSITIONS.TRAILING > 0) {
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
            && this._book != null
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