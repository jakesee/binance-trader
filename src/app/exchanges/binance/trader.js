"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tick = require("animation-loops");
const _ = require("lodash");
const wait = require("wait-for-stuff");
const log = require("loglevel");
const technical = require("technicalindicators");
const Constant_1 = require("../../constants/Constant");
class Trader {
    constructor(binance) {
        this.binance = binance;
        this.MACD = technical.MACD;
        this.BB = technical.BollingerBands;
        this.RSI = technical.RSI;
        this.EMA = technical.EMA;
        this._binance = binance;
        // events
        // 	CANCELED
        // 	NEW
        // 	PARTIALLY_FILLED
        // 	FILLED
        this._binance.events.on('NEW', (data) => { });
        this._binance.events.on('CANCELED', (data) => { this.onCancelOrder(data); });
        this._binance.events.on('PARTIALLY_FILLED', (data) => { });
        this._binance.events.on('FILLED', (data) => { this.onFilledOrder(data); });
    }
    start() {
        var handle = tick.add((elapse, delta, stop) => {
            var symbols = this.binance.getSymbols();
            _.forOwn(symbols, (symbol, key) => {
                var tooFrequent = (elapse - symbol.lastTime) < symbol.config.frequency;
                if (tooFrequent || !symbol.ready()) {
                    return; // skip if not ready
                }
                symbol.lastTime = elapse;
                var price = Number(symbol.trade.price);
                var position = symbol.config.bag.position;
                var quantity = symbol.config.bag.quantity;
                if (position == Constant_1.POSITIONS.BUYING) {
                    this._buying(symbol); // trailing buy, buying the lowest possible
                }
                else if (position == Constant_1.POSITIONS.BIDDING) {
                    this._bidding(symbol, price); // bid placed, waiting for taker
                }
                else if (position == Constant_1.POSITIONS.SELLING) {
                    this._selling(symbol); // trailing sell if price goes up;
                }
                else if (position == Constant_1.POSITIONS.ASKING) {
                    this._asking(symbol, price); // asking price offered, waiting for taker
                }
                else if (position == Constant_1.POSITIONS.SELL) {
                    this._sell(symbol, price);
                }
                else if (symbol.wantToSell() && !this._sell(symbol, price)) {
                    this._dca(symbol, price); // do technical analysis to see if good to buy	
                }
                else {
                    this._buy(symbol, price); // do technical analysis to see if good to buy
                }
            });
        });
    }
    _dca(symbol, price) {
        var bag = symbol.config.bag;
        if (bag.dca.enabled !== true || bag.dca.levels.length == 0) {
            // concentrate on selling since cannot DCA anymore
            bag.position = Constant_1.POSITIONS.SELL;
        }
        else {
            var nextDCAPrice = bag.cost + (bag.cost * bag.dca.levels[0]);
            log.debug('dca', symbol.symbol, '@', nextDCAPrice);
            if (price <= nextDCAPrice) {
                symbol.config.bag.position = Constant_1.POSITIONS.BUYING;
                symbol.config.bag.bid = price;
                symbol.config.bag.bid0 = price;
                log.debug('dca', symbol.symbol, '@', price);
                bag.dca.levels.shift();
            }
        }
    }
    _buy(symbol, price) {
        log.debug('buy', symbol.symbol, '@', price);
        var tech = this._getTechnicalAnalysis(symbol);
        var buyStrategy = symbol.config.strategy.buy;
        var bag = symbol.config.bag;
        var shouldBuy = true;
        if (shouldBuy && buyStrategy.macd.enabled === true) {
            log.debug('MACD not implemented yet');
        }
        if (shouldBuy && buyStrategy.rsi.enabled === true) {
            if (tech.rsi[0] > buyStrategy.rsi.trigger)
                shouldBuy = false;
        }
        if (shouldBuy && buyStrategy.bb.enabled === true) {
            if (buyStrategy.bb.reference == 'lowbb') {
                var level = ((price - tech.bb[0].lower) / tech.bb[0].lower);
                // to buy, if trigger is negative, level must be lower than trigger
                // to buy, if trigger is positive, level must be higher than trigger
                if ((buyStrategy.bb.trigger < 0 && level > buyStrategy.bb.trigger)
                    || (buyStrategy.bb.trigger > 0 && level < buyStrategy.bb.trigger)) {
                    shouldBuy = false;
                }
            }
        }
        if (shouldBuy && buyStrategy.emaspread.enabled === true) {
            var level = (tech.emafast / tech.emaslow) - 1;
            log.debug("emaspread", level);
            // to buy, if trigger is negative, then price must be lower than trigger
            // to buy, if trigger is positive, then price must be higher than trigger
            if ((buyStrategy.emaspread.trigger < 0 && level > buyStrategy.emaspread.trigger)
                || (buyStrategy.emaspread.trigger > 0 && level < buyStrategy.emaspread.trigger)) {
                shouldBuy = false;
            }
        }
        if (shouldBuy && buyStrategy.emafast.enabled === true) {
            var level = (price / tech.emafast) - 1;
            log.debug("emafast", level);
            if ((buyStrategy.emafast.trigger < 0 && level > buyStrategy.emafast.trigger)
                || (buyStrategy.emafast.trigger > 0 && level < buyStrategy.emafast.trigger)) {
                shouldBuy = false;
            }
        }
        if (shouldBuy && buyStrategy.emaslow.enabled === true) {
            var level = (price / tech.emaslow) - 1;
            if ((buyStrategy.emaslow.trigger < 0 && level > buyStrategy.emaslow.trigger)
                || (buyStrategy.emaslow.trigger > 0 && level < buyStrategy.emaslow.trigger)) {
                shouldBuy = false;
            }
        }
        if (shouldBuy) {
            // change state to buying
            log.debug(symbol.symbol, 'shouldBuy now');
            symbol.config.bag.position = Constant_1.POSITIONS.BUYING;
            symbol.config.bag.bid = price;
            symbol.config.bag.bid0 = price;
            log.debug(symbol.config.bag);
            symbol.initDCA();
        }
    }
    _buying(symbol) {
        var price = Number(symbol.tradeLowest.price);
        var bag = symbol.config.bag;
        // trail the falling prices to enter at lowest possible price
        log.debug('buying', symbol.symbol, bag.bid, bag.bid + (bag.bid * symbol.config.strategy.buy.trail));
        if (price <= bag.bid) {
            bag.bid = price; // set new price target
        }
        else {
            var stop = bag.bid + (bag.bid * symbol.config.strategy.buy.trail);
            if (price > stop && price <= bag.bid0) {
                // make sure price is less than bag cost otherwise, the overall cost will increase!
                // once OK, immediately place order
                var book = symbol.getBook();
                var bid = book.bids[0].price;
                var ask = book.asks[0].price;
                if ((ask / bid) - 1 < symbol.config.strategy.buy.maxBuySpread) {
                    var quantity = Math.ceil(symbol.config.strategy.buy.minCost / bid);
                    if (bag.quantity > 0)
                        quantity = 2 * bag.quantity;
                    if (!symbol.canBuy(quantity, bid)) {
                        bag.position = Constant_1.POSITIONS.SELL; // just concentrate on selling, the loss is too little
                        return;
                    }
                    var order = wait.for.promise(this._binance.newBuyLimit(symbol.symbol, quantity, bid));
                    if (order != null) {
                        bag.order = {
                            'side': 'BUY',
                            'orderId': order.orderId,
                            'price': Number(order.price),
                            'quantity': Number(order.origQty)
                        };
                        log.info('buy limit', symbol.symbol, quantity, bid, bag.order);
                        bag.position = Constant_1.POSITIONS.BIDDING;
                    }
                    else {
                        log.error('buy limit error', symbol.symbol, quantity, bid, price);
                        bag.position = Constant_1.POSITIONS.BUY;
                    }
                }
            }
            else if (price > bag.bid0) {
                bag.position = Constant_1.POSITIONS.BUY;
            }
        }
    }
    _bidding(symbol, price) {
        var bag = symbol.config.bag;
        var order = bag.order;
        if (order != null && bag.position == Constant_1.POSITIONS.BIDDING) {
            var book = symbol.getBook();
            var bid0 = book.bids[0];
            var ask0 = book.asks[0];
            log.debug('bidding', symbol.symbol, order.price, bid0.price, bid0.quantity, ask0.quantity, bid0.quantity / ask0.quantity);
            if (order.price < bid0.price && (bid0.quantity / ask0.quantity) > 1.1) {
                var cancel = wait.for.promise(this._binance.cancelOrder(symbol.symbol, order.orderId));
                if (cancel != null) {
                    bag.position = null;
                    this._buy(symbol, price); // check whether still OK to buy
                }
            }
        }
    }
    _asking(symbol, price) {
        var bag = symbol.config.bag;
        var order = bag.order;
        if (order != null && bag.position == Constant_1.POSITIONS.ASKING) {
            var book = symbol.getBook();
            var bid0 = book.bids[0];
            var ask0 = book.asks[0];
            log.debug('asking', symbol.symbol, order.price, ask0.price, ask0.quantity, bid0.quantity, ask0.quantity / bid0.quantity);
            if (order.price > ask0.price && (ask0.quantity / bid0.quantity) > 1.1) {
                var cancel = wait.for.promise(this._binance.cancelOrder(symbol.symbol, order.orderId));
                if (cancel != null) {
                    bag.position = null;
                    this._sell(symbol, price); // check whether still OK to sell
                }
            }
        }
    }
    onFilledOrder(data) {
        log.info('bag', data.executionType, data.orderId);
        var symbols = this._binance.getSymbols();
        // check whether we are cancelling the order we are currently tracking,
        // otherwise, it is some other order we don't have to care about.
        if (data.orderId == symbols[data.symbol].config.bag.order.orderId) {
            symbols[data.symbol].config.bag.order = null;
            symbols[data.symbol].config.bag.position = null; // go back to buy mode
            log.info('bag', data.executionType, data.orderId, symbols[data.symbol].config.bag.quantity, symbols[data.symbol].config.bag.cost);
        }
    }
    onCancelOrder(data) {
        log.info('bag', data.executionType, data.orderId);
        var symbols = this._binance.getSymbols();
        // check whether we are cancelling the order we are currently tracking,
        // otherwise, it is some other order we don't have to care about.
        if (data.orderId == symbols[data.symbol].config.bag.order.orderId) {
            symbols[data.symbol].config.bag.order = null;
            symbols[data.symbol].config.bag.position = null; // go back to buy mode
            log.info('bag', data.executionType, data.orderId, symbols[data.symbol].config.bag.quantity, symbols[data.symbol].config.bag.cost);
        }
    }
    _sell(symbol, price) {
        var sellStrategy = symbol.config.strategy.sell;
        var shouldSell = true;
        var cost = symbol.config.bag.cost;
        var quantity = symbol.config.bag.quantity;
        if (shouldSell && (quantity * cost < sellStrategy.minCost)) {
            shouldSell = false;
        }
        if (shouldSell && sellStrategy.gain.enabled == true) {
            var targetsell = cost * sellStrategy.gain.target;
            if (price <= targetsell) {
                log.debug('sell', symbol.symbol, 'cost', cost, 'now', price, 'target', targetsell);
                shouldSell = false;
            }
        }
        if (shouldSell) {
            log.debug(symbol.symbol, 'shouldSell now');
            symbol.config.bag.position = Constant_1.POSITIONS.SELLING;
            symbol.config.bag.ask = price;
            symbol.config.bag.ask0 = price;
        }
        return shouldSell;
    }
    _selling(symbol) {
        var price = Number(symbol.tradeHighest.price);
        var bag = symbol.config.bag;
        log.debug(symbol.symbol, 'selling', bag.ask, bag.ask - (bag.ask * symbol.config.strategy.sell.trail));
        if (price > bag.ask) {
            bag.ask = price;
        }
        else {
            var stop = bag.ask - (bag.ask * symbol.config.strategy.sell.trail);
            if (price < stop && price >= bag.ask0) {
                // immediately place order
                var book = symbol.getBook();
                var ask = book.asks[0].price;
                var quantity = bag.quantity;
                var order = wait.for.promise(this._binance.newSellLimit(symbol.symbol, quantity, ask));
                if (order != null) {
                    bag.order = {
                        'side': 'SELL',
                        'orderId': order.orderId,
                        'price': Number(order.price),
                        'quantity': Number(order.origQty)
                    };
                    log.info('sell limit', symbol.symbol, quantity, ask, bag.order);
                    bag.position = Constant_1.POSITIONS.ASKING;
                }
                else {
                    log.error('sell limit error', symbol.symbol, quantity, ask, price);
                    bag.position = Constant_1.POSITIONS.SELL;
                }
            }
            else if (price < bag.ask0) {
                bag.position = Constant_1.POSITIONS.SELL;
            }
        }
    }
    _getTechnicalAnalysis(symbol) {
        var macd = null;
        var bb = null;
        var rsi = null;
        var emafast = null;
        var emaslow = null;
        var indicator = symbol.config.indicator;
        var strategy = symbol.config.strategy;
        var closes = _.map(symbol.kline, (candle) => { return Number(candle.close); });
        if (strategy.buy.macd.enabled === true) {
            var macdInput = {
                values: closes,
                period: 0,
                fastPeriod: indicator.macd.fastPeriod,
                slowPeriod: indicator.macd.slowPeriod,
                signalPeriod: indicator.macd.signalPeriod,
                SimpleMAOscillator: false,
                SimpleMASignal: false,
            };
            macd = _.takeRight(this.MACD.calculate(macdInput), 1); // we need this many data points to decide on buy
        }
        if (strategy.buy.bb.enabled === true) {
            var bbInput = {
                'values': closes,
                'period': indicator.bb.period,
                'stdDev': indicator.bb.stdDev,
            };
            bb = _.takeRight(this.BB.calculate(bbInput), 1);
        }
        if (strategy.buy.rsi.enabled === true) {
            var rsiInput = {
                'values': closes,
                'period': indicator.rsi.period
            };
            rsi = _.takeRight(this.RSI.calculate(rsiInput), 1);
        }
        if (strategy.buy.emaspread.enabled === true) {
            var emafastInput = { 'values': closes, 'period': indicator.ema.fastPeriod };
            emafast = _.takeRight(this.EMA.calculate(emafastInput), 1);
            var emaslowInput = { 'values': closes, 'period': indicator.ema.slowPeriod };
            emaslow = _.takeRight(this.EMA.calculate(emaslowInput), 1);
        }
        if (strategy.buy.emafast.enabled == true && emafast == null) {
            var emafastInput = { 'values': closes, 'period': indicator.ema.fastPeriod };
            emafast = _.takeRight(this.EMA.calculate(emafastInput), 1);
        }
        if (strategy.buy.emaslow.enabled == true && emaslow == null) {
            var emaslowInput = { 'values': closes, 'period': indicator.ema.slowPeriod };
            emaslow = _.takeRight(this.EMA.calculate(emaslowInput), 1);
        }
        return {
            'macd': macd, 'bb': bb, 'rsi': rsi,
            'emafast': emafast, 'emaslow': emaslow
        };
    }
}
exports.Trader = Trader;
//# sourceMappingURL=Trader.js.map