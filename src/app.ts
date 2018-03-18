import * as log from "loglevel";
import {Binance} from "./exchange/Binance";
import { Configurator } from "./Configurator";
const configurator = new Configurator("binance"); // load the config once
const config:{[key:string]:any} = configurator.getConfig();

var exchange = new Binance(config);
exchange.start();
console.log("hello");
exchange.on("depth", (data:any) => {
    console.log(data);
});
console.log("world");