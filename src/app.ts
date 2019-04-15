import * as log from "loglevel";
import { IExchange } from "./exchange/IExchange";
import { Bootstrap } from "./Bootstrap";
import { Trader } from "./Trader";
import { Strategy } from "./Strategy";

var exchange = new Bootstrap().getExchange();
if(exchange != null) {
    exchange.start();
    var trader = new Trader(exchange, new Strategy());
    trader.start();
}