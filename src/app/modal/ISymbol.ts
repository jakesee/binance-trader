import { IBook } from "./IBook";

export interface IKLine {
    interval: number;
}


export interface ISymbol {
    symbol: string;
    lastTime: number;
    kline: IKLine;
    ticker: any;
    tradeNow: String;
    bookBuffer: Array<any>;

    loadDefaultSymbolConfig();
}