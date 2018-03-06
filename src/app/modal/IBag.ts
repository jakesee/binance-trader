import { IStrategy } from "./IStrategy";
import { Idca } from "./strategies/Idca";

export interface IBag {
    quantity: number;
    cost: number,
    dca: Idca,
    POSITION: number
}