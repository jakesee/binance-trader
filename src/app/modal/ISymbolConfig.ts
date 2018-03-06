import { IStrategy } from "./IStrategy";
import { IBag } from "./IBag";


export interface ISymbolConfig {
    strategy: IStrategy,
    bag: IBag
}