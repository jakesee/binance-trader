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
    NONE = 0b000000000,
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
    getTradeSellerWin():ITrade;
    getTradeBuyerWin():ITrade;
    getTicker():ITicker;
    getOrderBook():IOrderBook;
    getSettings():ISettings;
    setSettings(settings:ISettings, quantity:number, cost:number):void
    setLastQueryTime(elaspseTime:number):void;
    isTimeToQuery(elapsedTime:number):boolean;
    isReady():boolean;
    resetDCA():void; // TODO: this should be initSellMode()
    canBuy(quantity:number, price:number):boolean;
    shouldSell():boolean;
    clearOrder():void;
}

export interface IOrder {
    quantity:number;
    price:number;
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
    maker:boolean; // Is the buyer the market maker?
}
export class IBag {
    public order:null|{
        orderId:number;
        price:number;
        quantity:number;
        side:string;
    } = null;
    public cost:number = 0;
    public quantity:number = 0;
    public position:POSITION = POSITION.NONE;
    public bid:number = 0;
    public bid0:number = 0;
    public ask:number = 0;
    public ask0:number = 0;
    public dca:{
        levels:number[];
        enabled:boolean;
    } = { enabled: false, levels: [] };
}
export interface ISettings {
    bag:IBag;
    [key: string]:any;
}