/*jshint esnext: true */
/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global require, module, process, appConfig*/


process.env.NODE_ENV = process.env.NODE_ENV || 'dev'

console.log("process.env.NODE_ENV", process.env.NODE_ENV);

import * as express from 'express'
import * as log from 'loglevel';
import * as Config from './config/index';

console.log("config", Config);

let Exchange = require('./exchanges/exchnage');

class App {

  public express;

  constructor() {
    this.express = express()
    this.mountRoutes();
    this.initDependencies()
  }

  initDependencies(): void {
    log.setLevel('trace');
  }

  private mountRoutes(): void {
    const router = express.Router()
    router.get('/', (req, res) => {
      res.json({
        message: 'Hello World!'
      })
    })
    this.express.use('/', router)
  }
}

export default new App().express