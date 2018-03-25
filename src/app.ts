import * as log from "loglevel";
import { IExchange } from "./exchange/IExchange";
import { Bootstrap } from "./Bootstrap";
import { Trader } from "./Trader";

var exchange = new Bootstrap().getExchange();
if(exchange != null) {
    exchange.start();
    var trader = new Trader(exchange);
    trader.start();
}