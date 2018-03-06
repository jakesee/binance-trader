
import { Idca } from "./strategies/Idca";

export interface IBuy {
    minCost: number
}

export interface IStrategy {
    dca: Idca,
    buy: IBuy
}