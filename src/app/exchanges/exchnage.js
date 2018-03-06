/*jshint esnext: true */
/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global module, require*/

(function () {
    'use strict';

    let Binance = require("./binance");

    class ExchangeLoader {

        constructor() {
            this.exchangeMap = {
                binance: new Binance()
            };
        }

        getExchange(name) {
            let exchange = this.exchangeMap[name];
            if (!exchange) {
                throw Error('invalid exchange name');
            }
            return exchange;
        }

        //TODO
        executeQuery(query) {
            let exchange = this.getExchange(query);
            return exchange;
        }
    }

    module.exports = ExchangeLoader;

})();
