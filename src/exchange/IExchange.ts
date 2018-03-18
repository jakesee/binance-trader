export interface IExchange
{
    start():void // starts the exchange
    on(event:string, callback:{(arg:any):void}):void; // allows consumers to subscribe to events
    getAssets():{[key:string]:IAsset}; // assoc array key = symbol name
    placeSellLimit(symbol:string, quantity:number, ask:number):{};
    placeBuyLimit(symbol:string, quantity:number, bid:number):{};
    cancelOrder(symbol:string, orderId:number):{};
}

export enum POSITION {
    BUY = 0b000000001,
    BUYING = 0b000000010,
    BIDDING = 0b000000100,
    SELL = 0b000001000,
    SELLING = 0b000010000,
    ASKING = 0b000100000,
    TRAILING = 0b000010010
}

export interface IAsset {
    getSymbol():string;
    getKlines():IKline[];
    getTrade():ITrade;
    getTradeLowest():ITrade;
    getTradeHighest():ITrade;
    getTicker():ITicker;
    getOrderBook():IOrderBook;
    getConfig():{[key:string]:any};
    setLastQueryTime(elaspseTime:number):void;
    isTimeToQuery(elapsedTime:number):boolean;
    isReady():boolean;
    initSellMode():void;
    initBuyMode():void;
    canBuy(quantity:number, price:number):boolean;
    shouldSell():boolean;
}

export interface IOrder {
    quantity:number;
    price:number
}
export interface IOrderBook {
    bids:IOrder[];
    asks:IOrder[];
}
export interface IKline {
    open:number;
    close:number;
    high:number;
    low:number;
}
export interface ITicker {
    price:number;
}
export interface ITrade {
    price:number;
    quantity:number;
}