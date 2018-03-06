export interface IBookRecord {
    price: number;
    quantity: number
}

export interface IBook {
    lastUpdateId: string;
    bids: IBookRecord;
    asks: IBookRecord;
    bidDepthDelta: any; //TODO
    askDepthDelta: any;//TODO
}