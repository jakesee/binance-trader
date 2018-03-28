"use strict";
/*jshint esnext: true */
/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global require, module, process, appConfig*/
Object.defineProperty(exports, "__esModule", { value: true });
process.env.NODE_ENV = process.env.NODE_ENV || 'dev';
console.log("process.env.NODE_ENV", process.env.NODE_ENV);
const express = require("express");
const log = require("loglevel");
const Config = require("./config/index");
console.log("config", Config);
let Exchange = require('./exchanges/exchnage');
class App {
    constructor() {
        this.express = express();
        this.mountRoutes();
        this.initDependencies();
    }
    initDependencies() {
        log.setLevel('trace');
    }
    mountRoutes() {
        const router = express.Router();
        router.get('/', (req, res) => {
            res.json({
                message: 'Hello World!'
            });
        });
        this.express.use('/', router);
    }
}
exports.default = new App().express;
//# sourceMappingURL=App.js.map