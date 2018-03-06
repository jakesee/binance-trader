/**
 * TSymbol : Since Symbol is the reserve varaible, so this is named is TSymbol (Traidng symbol)
 */

import * as _ from "lodash";
import { ISymbol, IKLine } from './ISymbol';
import { BaseModal } from './BaseModal';
import { ISymbolConfig } from './ISymbolConfig';
import { IBook, IBookRecord } from "./IBook";

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
    private book: IBook;
    private trade: IBookRecord;
    private tradeLowest: IBookRecord;
    private tradeHighest: IBookRecord;

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
    loadDefaultSymbolConfig(): void {

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
    loadConfig(config, quantity, cost) {
        this.config = config;
        if (this.config.bag.quantity == null) this.config.bag.quantity = quantity;
        if (this.config.bag.cost == null) this.config.bag.cost = cost;
        this.config.bag.quantity = Math.min(this.config.bag.quantity, quantity);
        if (this.config.bag.cost > 0) this.initDCA();
    }

    /**
     * 
     * @param b 
     */
    updateBook(b: IBook): void {
        if (this.book == null) { // buffer the stream so that depth snapshot can be updated properly
            this.bookBuffer.push(b);
            return;
        }
        // drop update if old
        if (b.lastUpdateId <= this.book.lastUpdateId) return;
        this.book.lastUpdateId = b.lastUpdateId
        _.each(b.bidDepthDelta, (bid) => {
            var quantity = Number(bid.quantity);
            var price = bid.price; // typeof string
            if (quantity > 0) {
                this.book.bids[price] = { 'price': Number(price), 'quantity': quantity };
            } else {
                delete this.book.bids[price];
            }
        });
        _.each(b.askDepthDelta, (ask) => {
            var quantity = Number(ask.quantity);
            var price = ask.price; // typeof string
            if (quantity > 0) {
                this.book.asks[price] = { 'price': Number(price), 'quantity': quantity };
            } else {
                delete this.book.asks[price];
            }
        });

        //TODO: need to verify this
        this.book.bids = _.orderBy(this.book.bids, ['price'], ['desc'])
        this.book.asks = _.orderBy(this.book.asks, ['price'], ['desc'])

    }

    /**
     * 
     * @param b 
     */
    initBookObj(b): IBook {
        return {
            lastUpdateId: b.lastUpdateId,
            bids: { price: 0, quantity: 0 },
            asks: { price: 0, quantity: 0 },
            askDepthDelta: {},
            bidDepthDelta: {}
        }
    }

    /**
     * 
     * @param b 
     */
    setBook(b: IBook) {

        this.book = this.initBookObj(b);

        _.each(b.bids, (bid) => {
            this.book.bids[bid[0]] = { price: Number(bid[0]), quantity: Number(bid[1]) };
        });
        _.each(b.asks, (ask) => {
            this.book.asks[ask[0]] = { price: Number(ask[0]), quantity: Number(ask[1]) };
        });
        _.each(this.bookBuffer, (b) => {
            this.updateBook(b);
        });
    }

    /** */
    getBook(): IBook {
        return this.book;
    }
    /**
     * 
     * @param trade 
     */
    updateTrade(trade: IBookRecord): void {

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
            && this.book != null
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