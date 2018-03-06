export interface IBookOrder {
    price: number;
    quantity: number
}

export interface IBook {
    lastUpdateId: number;
    bids: Array<IBookOrder>;
    asks: Array<IBookOrder>;
}

// Order book changes
export interface IBookDelta {
    lastUpdateId: number;
    bidDepthDelta: Array<IBookOrder>;
    askDepthDelta: Array<IBookOrder>;
}