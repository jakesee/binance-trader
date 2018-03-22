import * as log from "loglevel";
import {Binance} from "./exchange/Binance";
import { Configurator } from "./Configurator";
import { Trader } from "./trader";
const configurator = new Configurator("binance"); // load the config once
const config:{[key:string]:any} = configurator.getConfig();
log.setLevel(config.audit || "trace");

var exchange = new Binance(config);
exchange.start();

var trader = new Trader(exchange);
trader.start();