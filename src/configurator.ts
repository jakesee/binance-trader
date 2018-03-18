import * as fs from "fs";
import * as _ from "lodash";
import * as log from "loglevel";

export class Configurator {

    private _config:{[key:string]:any} = {};

    constructor(private _prefix:string) {
        this.load();
    }
    public getConfig():{[key:string]:any} {
        return this._config;
    }
    public load() {        
        
        // TODO: load the default config and fill in values missing in the prefixed config
        var config:{[key:string]:any} = this._loadFile("./config/"+this._prefix+"_config.json");
        
        if(!_.has(config, 'symbols') || !_.has(config, 'default')) {
            console.log("need symbols and default");
            return;
        } else {
            // load the environment file, which contains the API and Secret to the exchanges as well
            process.env.NODE_ENV = process.env.NODE_ENV || "dev";
            var environment = this._loadFile("./config/"+process.env.NODE_ENV+".json");
            config.audit = environment.audit;
            config[this._prefix] = {
                'key': process.env.key || environment[this._prefix].key,
                'secret': process.env.secret || environment[this._prefix].secret
            }
        
            // need at least 1 symbol for trading
            if(!Array.isArray(config.symbols) || config.symbols.length == 0) {
                return;
            } else {
                _.each(config.symbols, (symbol:string) => {
                    if(!_.has(config, symbol)) config[symbol] = {};
                    _.defaultsDeep(config[symbol], _.cloneDeep(config.default));
                    config[symbol].bag.order = null;
                    config[symbol].bag.position = null;
                });
            }
    
            // return the config
            this._config = config;
            return this._config;
        }
    }
    private _loadFile(path:string):{[key:string]:any} {
        if(!fs.existsSync(path)) path = "./config/default.json";
        var config = JSON.parse(fs.readFileSync(path).toString());
        return config;
    }
}