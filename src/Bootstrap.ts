import * as _ from "lodash";
import * as log from "loglevel";
import * as fs from "fs";
import {IExchange, ISettings, IBag} from "./exchange/IExchange";

// load all the exchanges
import {Binance} from "./exchange/Binance";
// import {Gdax} from "./exchange/Gdax"; // TODO: implement GDAX IExchange
// etc.
var EXCHANGES = ['binance']; // 

export class Bootstrap {

    private _config:{[key:string]:any} = require('./config/default.js');
    private _exchange:IExchange|null = null;

    constructor() {
        this._load();
        log.info('final config', this._config);
    }
    public getConfig():{[key:string]:any} {
        return this._config;
    }
    public getExchange():IExchange|null {
        return this._exchange;
    }
    private _load():void {       

        // set logging level according to config file
        this._config["logLevel"] = this._config["logLevel"] || "trace";
        log.setLevel(this._config["logLevel"]);

        // override config with commandline supplied exchange name
        if(true == !!process.argv[2] && EXCHANGES.indexOf(process.argv[2]) >= 0) {
            this._config['exchange'] = process.argv[2];
        }

        // check for mandatory configuration
        if(!_.has(this._config, 'exchange') || EXCHANGES.indexOf(this._config.exchange) < 0) {
            log.error("config.exchange is undefined or unrecognized.");
        } else if(!_.has(this._config, 'symbols')) {
            log.error("config.symbols is missing.");
        } else if(!_.has(this._config, 'default')) {
            log.error("config.default is missing.");
        } else {
            // load the secret keys from a separate file; this secret.json should not commit to source control
            var secretPath = "./config/secret.json";
            var secret = this._loadFile(secretPath);
            this._config[this._config.exchange] = {
                'key': process.env.key || secret[this._config.exchange].key,
                'secret': process.env.secret || secret[this._config.exchange].secret
            }
        
            // need at least 1 symbol for trading
            if(!Array.isArray(this._config.symbols) || this._config.symbols.length == 0) {
                return;
            } else {
                _.each(this._config.symbols, (symbol:string) => {
                    if(!_.has(this._config, symbol)) this._config[symbol] = {};
                    _.defaultsDeep(this._config[symbol], _.cloneDeep(this._config.default));
                });
            }
    
            // create the IExchange
            this._createExchange(this._config.exchange);
        }
    }

    private _loadFile(path:string):any {
        var json = {}
        if(fs.existsSync(path)) {
            try {
                var data = fs.readFileSync(path).toString();
                json = JSON.parse(data);
            } catch(err) {
                log.error(err);
            }
            return json
        } else {
            log.error("Cannot find path:", path);
        }
    }

    // factory create the exchange object based on config or supplied commandline argument
    private _createExchange(exchange:string) {
        switch(exchange) {
            case "binance":
                this._exchange = new Binance(this._config);
                break;
            case "gdax":
                // TODO:
                break;
            default:
                break;
        }
    }
}