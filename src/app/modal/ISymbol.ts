import { IBook } from "./IBook";

export interface IKLine {
    interval: number;
}


export interface ISymbol {
    symbol: string;
    lastTime: number;
    kline: IKLine;
    ticker: any;
    trade; // TODO: create ITrade

    loadDefaultSymbolConfig(config: any, quantity: number, cost: number): void;
}