'use strict';
var _ = require('lodash');
var tick = require('animation-loops');
var wait = require('wait-for-stuff');
var log = require('loglevel');

var Symbol = require('./symbol.js');

var technical = require('technicalindicators');
var MACD = technical.MACD;
var BB = technical.BollingerBands;
var RSI = technical.RSI;
var EMA = technical.EMA;

module.exports = function(binance) {

	var _binance = binance;

	// events
	// 	CANCELED
	// 	NEW
	// 	PARTIALLY_FILLED
	// 	FILLED
	_binance.events.on('NEW', (data) => {  });
	_binance.events.on('CANCELED', (data) => { this.onCancelOrder(data);  });
	_binance.events.on('PARTIALLY_FILLED', (data) => { });
	_binance.events.on('FILLED', (data) => { this.onFilledOrder(data); });

	this.start = function() {

		var handle = tick.add((elapse, delta, stop) => {
			var symbols = _binance.getSymbols();

			_.forOwn(symbols, (symbol, key) => {

				var tooFrequent = (elapse - symbol.lastTime) < symbol.config.frequency
				if(tooFrequent || !symbol.ready()) {
					return; // skip if not ready
				}
				symbol.lastTime = elapse;

				var price = Number(symbol.trade.price);
				var position = symbol.config.bag.position;
				var quantity = symbol.config.bag.quantity;

				if(position == Symbol.POSITION.BUYING) {
					this._buying(symbol); // trailing buy, buying the lowest possible
				} else if(position == Symbol.POSITION.BIDDING) {
					this._bidding(symbol, price); // bid placed, waiting for taker
				} else if(position == Symbol.POSITION.SELLING) {
					this._selling(symbol); // trailing sell if price goes up;
				} else if(position == Symbol.POSITION.ASKING) {
					this._asking(symbol, price); // asking price offered, waiting for taker
				} else if(position == Symbol.POSITION.SELL) {
					this._sell(symbol, price);
				} else if (symbol.wantToSell() && !this._sell(symbol, price)) { // there are items in bag, need to sell off
					this._dca(symbol, price); // do technical analysis to see if good to buy	
				} else {
					this._buy(symbol, price); // do technical analysis to see if good to buy
				}
			});
		});
	}

	this._dca = function(symbol, price) {
		var bag = symbol.config.bag;

		if(bag.dca.enabled !== true || bag.dca.levels.length == 0) {
			// concentrate on selling since cannot DCA anymore
			bag.position = Symbol.POSITION.SELL;
		} else {
			var nextDCAPrice = bag.cost + (bag.cost * bag.dca.levels[0]);
			log.debug('dca', symbol.symbol, '@', nextDCAPrice);
			if (price <= nextDCAPrice) {
				symbol.config.bag.position = Symbol.POSITION.BUYING;
				symbol.config.bag.bid = price;
				symbol.config.bag.bid0 = price;
				log.debug('dca', symbol.symbol, '@', price);
				bag.dca.levels.shift();
			}
		}
	}

	this._buy = function(symbol, price) {
		log.debug('buy', symbol.symbol, '@', price);

		var tech = this._getTechnicalAnalysis(symbol);
		var buyStrategy = symbol.config.strategy.buy;
		var bag = symbol.config.bag;

		var shouldBuy = true

		if(shouldBuy && buyStrategy.macd.enabled === true) {
			log.debug('MACD not implemented yet');
		}
		if(shouldBuy && buyStrategy.rsi.enabled === true) {
			if(tech.rsi[0] > buyStrategy.rsi.trigger)
				shouldBuy = false;
		}
		if(shouldBuy && buyStrategy.bb.enabled === true) {
			if(buyStrategy.bb.reference == 'lowbb') {
				var level = ((price - tech.bb[0].lower) / tech.bb[0].lower);
				// to buy, if trigger is negative, level must be lower than trigger
				// to buy, if trigger is positive, level must be higher than trigger
				if((buyStrategy.bb.trigger < 0 && level > buyStrategy.bb.trigger)
					|| (buyStrategy.bb.trigger > 0 && level < buyStrategy.bb.trigger)) {
					shouldBuy = false;
				}
			}
		}
		if(shouldBuy && buyStrategy.emaspread.enabled === true) {
			var level = (tech.emafast / tech.emaslow) - 1;
			log.debug("emaspread", level);
			// to buy, if trigger is negative, then price must be lower than trigger
			// to buy, if trigger is positive, then price must be higher than trigger
			if((buyStrategy.emaspread.trigger < 0 && level > buyStrategy.emaspread.trigger)
				|| (buyStrategy.emaspread.trigger > 0 && level < buyStrategy.emaspread.trigger)) {
				shouldBuy = false;
			}
		}
		if(shouldBuy && buyStrategy.emafast.enabled === true) {
			var level = (price / tech.emafast) - 1;
			log.debug("emafast", level);
			if((buyStrategy.emafast.trigger < 0 && level > buyStrategy.emafast.trigger)
				|| (buyStrategy.emafast.trigger > 0 && level < buyStrategy.emafast.trigger)) {
				shouldBuy = false;	
			}
		}
		if(shouldBuy && buyStrategy.emaslow.enabled === true) {
			var level = (price / tech.emaslow) -1;
			if((buyStrategy.emaslow.trigger < 0 && level > buyStrategy.emaslow.trigger)
				|| (buyStrategy.emaslow.trigger > 0 && level < buyStrategy.emaslow.trigger)) {
				shouldBuy = false;
			}
		}

		if(shouldBuy) {
			// change state to buying
			log.debug(symbol.symbol, 'shouldBuy now');
			symbol.config.bag.position = Symbol.POSITION.BUYING;
			symbol.config.bag.bid = price;
			symbol.config.bag.bid0 = price;
			log.debug(symbol.config.bag);
			symbol.initDCA();
		}
	}

	this._buying = function(symbol) {
		var price = Number(symbol.tradeLowest.price);
		var bag = symbol.config.bag;
		// trail the falling prices to enter at lowest possible price
		log.debug('buying', symbol.symbol, bag.bid, bag.bid + (bag.bid * symbol.config.strategy.buy.trail));
		if(price <= bag.bid) {
			bag.bid = price; // set new price target
		} else {
			var stop = bag.bid + (bag.bid * symbol.config.strategy.buy.trail);
			if(price > stop && price <= bag.bid0) {
				// make sure price is less than bag cost otherwise, the overall cost will increase!
				// once OK, immediately place order
				var book = symbol.getBook();
				var bid = book.bids[0].price;
				var ask = book.asks[0].price;
				if((ask / bid) - 1 < symbol.config.strategy.buy.maxBuySpread) { // prevent pump
					var quantity = Math.ceil(symbol.config.strategy.buy.minCost / bid);
					if(bag.quantity > 0) quantity = 2 * bag.quantity;
					if(!symbol.canBuy(quantity, bid)) {
						bag.position = Symbol.POSITION.SELL; // just concentrate on selling, the loss is too little
						return;
					}
					var order = wait.for.promise(_binance.newBuyLimit(symbol.symbol, quantity, bid));
					if(order != null) {
						bag.order = {
							'side': 'BUY',
							'orderId': order.orderId,
							'price': Number(order.price),
							'quantity': Number(order.origQty)
						}
						log.info('buy limit', symbol.symbol, quantity, bid, bag.order);
						bag.position = Symbol.POSITION.BIDDING;
					} else {
						log.error('buy limit error', symbol.symbol, quantity, bid, price);
						bag.position = Symbol.POSITION.BUY;
					}
				}
			} else if(price > bag.bid0) {
				bag.position = Symbol.POSITION.BUY;
			}
		}
	}

	this._bidding = function(symbol, price) {
		var bag = symbol.config.bag;
		var order = bag.order;
		if(order != null && bag.position == Symbol.POSITION.BIDDING) {
			var book = symbol.getBook();
			var bid0 = book.bids[0];
			var ask0 = book.asks[0];
			log.debug('bidding', symbol.symbol, order.price, bid0.price, bid0.quantity, ask0.quantity, bid0.quantity / ask0.quantity);	
			if(order.price < bid0.price && (bid0.quantity / ask0.quantity) > 1.1) {
				var cancel = wait.for.promise(_binance.cancelOrder(symbol.symbol, order.orderId));
				if(cancel != null) {
					bag.position = null;
					this._buy(symbol, price); // check whether still OK to buy
				}
			}
		}
	}

	this._asking = function(symbol) {
		var bag = symbol.config.bag;
		var order = bag.order;
		if(order != null && bag.position == Symbol.POSITION.ASKING) {
			var book = symbol.getBook();
			var bid0 = book.bids[0];
			var ask0 = book.asks[0];
			log.debug('asking', symbol.symbol, order.price, ask0.price, ask0.quantity, bid0.quantity, ask0.quantity / bid0.quantity);	
			if(order.price > ask0.price && (ask0.quantity / bid0.quantity) > 1.1) {
				var cancel = wait.for.promise(_binance.cancelOrder(symbol.symbol, order.orderId));
				if(cancel != null) {
					bag.position = null;
					this._sell(symbol, price); // check whether still OK to sell
				}
			}
		}
	}

	this.onFilledOrder = function(data) {
		log.info('bag', data.executionType, data.orderId);
		var symbols = _binance.getSymbols();
		// check whether we are cancelling the order we are currently tracking,
		// otherwise, it is some other order we don't have to care about.
		if(data.orderId == symbols[data.symbol].config.bag.order.orderId) {
			symbols[data.symbol].config.bag.order = null;
			symbols[data.symbol].config.bag.position = null; // go back to buy mode
			log.info('bag', data.executionType, data.orderId, symbols[data.symbol].config.bag.quantity, symbols[data.symbol].config.bag.cost);
		}
	}

	this.onCancelOrder = function(data) {
		log.info('bag', data.executionType, data.orderId);
		var symbols = _binance.getSymbols();
		// check whether we are cancelling the order we are currently tracking,
		// otherwise, it is some other order we don't have to care about.
		if(data.orderId == symbols[data.symbol].config.bag.order.orderId) {
			symbols[data.symbol].config.bag.order = null;
			symbols[data.symbol].config.bag.position = null; // go back to buy mode
			log.info('bag', data.executionType, data.orderId, symbols[data.symbol].config.bag.quantity, symbols[data.symbol].config.bag.cost);
		}
		
	}

	this._sell = function(symbol, price) {

		var sellStrategy = symbol.config.strategy.sell;
		var shouldSell = true;
		var cost = symbol.config.bag.cost;
		var quantity = symbol.config.bag.quantity;

		if(shouldSell && (quantity * cost < sellStrategy.minCost)) {
			shouldSell = false;
		}

		if(shouldSell && sellStrategy.gain.enabled == true) {
			var targetsell = cost * sellStrategy.gain.target;
			if(price <= targetsell) {
				log.debug('sell', symbol.symbol, 'cost', cost, 'now', price, 'target', targetsell);
				shouldSell = false;
			}
		}

		if(shouldSell) {
			log.debug(symbol.symbol, 'shouldSell now');
			symbol.config.bag.position = Symbol.POSITION.SELLING;
			symbol.config.bag.ask = price;
			symbol.config.bag.ask0 = price;
		}

		return shouldSell;
	}

	this._selling = function(symbol) {
		var price = Number(symbol.tradeHighest.price);
		var bag = symbol.config.bag;

		log.debug(symbol.symbol, 'selling', bag.ask, bag.ask - (bag.ask * symbol.config.strategy.sell.trail));
		if(price > bag.ask) {
			bag.ask = price;
		} else {
			var stop = bag.ask - (bag.ask * symbol.config.strategy.sell.trail);
			if(price < stop && price >= bag.ask0) {
				// immediately place order
				var book = symbol.getBook();
				var ask = book.asks[0].price;
				var quantity = bag.quantity;
				var order = wait.for.promise(_binance.newSellLimit(symbol.symbol, quantity, ask));
				if(order != null) {
					bag.order = {
						'side': 'SELL',
						'orderId': order.orderId,
						'price': Number(order.price),
						'quantity': Number(order.origQty)
					}
					log.info('sell limit', symbol.symbol, quantity, ask, bag.order);
					bag.position = Symbol.POSITION.ASKING;
				} else {
					log.error('sell limit error', symbol.symbol, quantity, ask, price);
					bag.position = Symbol.POSITION.SELL;
				}
			} else if(price < bag.ask0) {
				bag.position = Symbol.POSITION.SELL;
			}
		}
	}

	this._getTechnicalAnalysis = function(symbol) {
		var macd = null; var bb = null; var rsi = null;
		var emafast = null; var emaslow = null;
		var indicator = symbol.config.indicator;
		var strategy = symbol.config.strategy;
		var closes = _.map(symbol.kline, (candle) => { return Number(candle.close); });
		
		if(strategy.buy.macd.enabled === true) {
			var macdInput = {
				'values': closes,
				'fastPeriod': indicator.macd.fastPeriod,
				'slowPeriod': indicator.macd.slowPeriod,
				'signalPeriod': indicator.macd.signalPeriod,
				'SimpleMAOscillator': false,
	  			'SimpleMASignal': false,
			}
			macd = _.takeRight(MACD.calculate(macdInput), 1); // we need this many data points to decide on buy
		}
		if(strategy.buy.bb.enabled === true) {
			var bbInput = {
				'values': closes,
				'period': indicator.bb.period,
				'stdDev': indicator.bb.stdDev,
			}
			bb = _.takeRight(BB.calculate(bbInput), 1);	
		}
		if(strategy.buy.rsi.enabled === true) {
			var rsiInput = {
				'values': closes,
				'period': indicator.rsi.period
			}
			rsi = _.takeRight(RSI.calculate(rsiInput), 1);
		}
		if(strategy.buy.emaspread.enabled === true) {
			var emafastInput = { 'values': closes, 'period': indicator.ema.fastPeriod };
			emafast = _.takeRight(EMA.calculate(emafastInput), 1);

			var emaslowInput = { 'values': closes, 'period': indicator.ema.slowPeriod };
			emaslow = _.takeRight(EMA.calculate(emaslowInput), 1);
		}
		if(strategy.buy.emafast.enabled == true && emafast == null)  {
			var emafastInput = { 'values': closes, 'period': indicator.ema.fastPeriod };
			emafast = _.takeRight(EMA.calculate(emafastInput), 1);
		}
		if(strategy.buy.emaslow.enabled == true && emaslow == null)  {
			var emaslowInput = { 'values': closes, 'period': indicator.ema.slowPeriod };
			emaslow = _.takeRight(EMA.calculate(emaslowInput), 1);
		}
		
		return {
			'macd': macd, 'bb': bb, 'rsi': rsi,
			'emafast': emafast, 'emaslow': emaslow
		 };
	}
}