import * as _ from "lodash";
import * as log from "loglevel";
import * as tick from "animation-loops";
import * as wait from "wait-for-stuff";
import * as technical from "technicalindicators";
import {IExchange, IAsset, POSITION, IKline, ISettings, IBag} from "./exchange/IExchange";
var MACD = technical.MACD;
var BB = technical.BollingerBands;
var RSI = technical.RSI;
var EMA = technical.EMA;

export class Trader {
    constructor(private _exchange:IExchange) {
        this._exchange.on('NEW', (data) => {  });
        this._exchange.on('CANCELED', (data) => { this._onCancelOrder(data);  });
        this._exchange.on('PARTIALLY_FILLED', (data) => { });
        this._exchange.on('FILLED', (data) => { this._onFilledOrder(data); });
    }

    public start() {
        var handle = tick.add((elapsed:number, delta:number, stop:()=>void) => {
            var assets = this._exchange.getAssets();

			_.forOwn(assets, (asset:IAsset, key:string) => {

                if(!asset.isTimeToQuery(elapsed)) return;
				asset.setLastQueryTime(elapsed);

				var price = Number(asset.getTrade().price);
				var position = asset.getSettings().bag.position;
				var quantity = asset.getSettings().bag.quantity;

				if(position == POSITION.BUYING) {
					this._buying(asset, price); // trailing buy, buying the lowest possible
				} else if(position == POSITION.BIDDING) {
					this._bidding(asset, price); // bid placed, waiting for taker
				} else if(position == POSITION.SELLING) {
					this._selling(asset, price); // trailing sell if price goes up;
				} else if(position == POSITION.ASKING) {
					this._asking(asset, price); // asking price offered, waiting for taker
				} else if(position == POSITION.SELL) {
					this._sell(asset, price);
				} else if (asset.shouldSell() && !this._sell(asset, price)) { // there are items in bag, need to sell off
					this._dca(asset, price); // do technical analysis to see if good to buy	
				} else {
					this._buy(asset, price); // do technical analysis to see if good to buy
				}
			});
        });
    }
    private _buy(asset:IAsset, price:number) {

		var buyStrategy = asset.getSettings().strategy.buy;		
		if (buyStrategy.enabled === false) {
			log.info("buy disabled", asset.getSymbol());
			return;
		}
		log.debug('buy', asset.getSymbol(), '@', price);
		var bag = asset.getSettings().bag;
		var tech = this._getTechnicalAnalysis(asset);

		var shouldBuy = true

		if(shouldBuy && buyStrategy.macd.enabled === true) {
			// TODO: implement MACD strategy trigger
			// tech.macd[0].MACD
			// tech.macd[0].signal
			// tech.macd[0].histogram
			// last element in tech.macd is the most recent value
			var macd = tech.macd;
			for(var i = 0; i < macd.length; i++) {
				macd[i].level = (macd[i].MACD / macd[i].signal) - 1;
				macd[i].diff = macd[i].MACD - macd[i].signal;
				macd[i].height = macd[i].signal / price;
			}
			var crossed:boolean = macd[0].diff * macd[1].diff < 0 || macd[1].diff * macd[2].diff < 0;
			var upup = macd[0].MACD < macd[1].MACD && macd[1].MACD < macd[2].MACD;
			var downdown = macd[0].MACD > macd[1].MACD && macd[1].MACD > macd[2].MACD;
			var updown = macd[0].MACD < macd[1].MACD && macd[1].MACD > macd[2].MACD;
			var downup = macd[0].MACD > macd[1].MACD && macd[1].MACD < macd[2].MACD;
			// NOTE: if MACD is straight then we cannot say anything about the direction.
			// TODO: may need to use more data points
			log.debug("MACD not implemented yet");
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
			log.debug(asset.getSymbol(), 'shouldBuy now');
			asset.getSettings().bag.position = POSITION.BUYING;
			asset.getSettings().bag.bid = price;
			asset.getSettings().bag.bid0 = price;
			log.debug(asset.getSettings().bag);
			asset.initDCA(); // TODO: this should be called when trader successfully buy asset
		}
    }
    private _buying(asset:IAsset, price:number) {
		var bag = asset.getSettings().bag;
		bag.bid = Number(asset.getTradeLowest().price); // update lowest price
		var stop = bag.bid + (bag.bid * asset.getSettings().strategy.buy.trail);
		// trail the falling prices to enter at lowest possible price
		log.debug('buying', asset.getSymbol(), "trigger:", bag.bid0, "best:", bag.bid, "price", price, "stop:", bag.bid + (bag.bid * asset.getSettings().strategy.buy.trail));
		if(price >= stop && price <= bag.bid0) {
			// make sure price is less than bag cost otherwise, the overall cost will increase!
			// once OK, immediately place order
			var book = asset.getOrderBook();
			var bid = book.bids[0].price;
			var ask = book.asks[0].price;
			console.log("spread", (ask / bid) - 1, asset.getSettings().strategy.buy.maxBuySpread);
			if((ask / bid) - 1 < asset.getSettings().strategy.buy.maxBuySpread) { // prevent pump
				var quantity = Math.ceil(asset.getSettings().strategy.buy.minCost / bid);
				if(bag.quantity > 0) quantity = 2 * bag.quantity;
				if(!asset.canBuy(quantity, bid)) {
					bag.position = POSITION.SELL; // just concentrate on selling, the loss is too little
					return;
				}
				var order = wait.for.promise(this._exchange.placeBuyLimit(asset.getSymbol(), quantity, bid));
				if(order != null) {
					bag.order = {
						'side': 'BUY',
						'orderId': order.orderId,
						'price': Number(order.price),
						'quantity': Number(order.origQty)
					}
					log.info('buy limit', asset.getSymbol(), quantity, bid, bag.order);
					bag.position = POSITION.BIDDING;
				} else {
					log.error('buy limit error', asset.getSymbol(), quantity, bid, price);
					bag.position = POSITION.BUY;
				}
			}
		} else if(price > bag.bid0) {
			bag.position = POSITION.BUY;
		}
	}
    private _bidding(asset:IAsset, price:number) {
		var bag = asset.getSettings().bag;
		var order = bag.order;
		if(order != null && bag.position == POSITION.BIDDING) {
			var book = asset.getOrderBook();
			var bid0 = book.bids[0];
			var ask0 = book.asks[0];
			log.debug('bidding', asset.getSymbol(), order.price, bid0.price, bid0.quantity, ask0.quantity, bid0.quantity / ask0.quantity);	
			if(order.price < bid0.price && (bid0.quantity / ask0.quantity) > 1.1) {
				var cancel = wait.for.promise(this._exchange.cancelOrder(asset.getSymbol(), order.orderId));
				if(cancel != null) {
					asset.clearOrder();
					this._buy(asset, price); // check whether still OK to buy
				}
			}
		}
	}
    private _sell(asset:IAsset, price:number):boolean {

		var sellStrategy = asset.getSettings().strategy.sell;
		if(sellStrategy.enabled === false) {
			log.info("sell disabled", asset.getSymbol());
			return false; // return shouldSell = false
		}
		var shouldSell = true;

		var cost = asset.getSettings().bag.cost;
		var quantity = asset.getSettings().bag.quantity;

		if(shouldSell && (quantity * cost < sellStrategy.minCost)) {
			shouldSell = false;
		}

		if(shouldSell && sellStrategy.gain.enabled == true) {
			var targetsell = cost * sellStrategy.gain.target;
			if(price <= targetsell) {
				log.debug('sell', asset.getSymbol(), 'cost', cost, 'now', price, 'target', targetsell);
				shouldSell = false;
			}
		}

		if(shouldSell) {
			log.debug(asset.getSymbol(), 'shouldSell now');
			asset.getSettings().bag.position = POSITION.SELLING;
			asset.getSettings().bag.ask = price;
			asset.getSettings().bag.ask0 = price;
		}

		return shouldSell;
    }
    private _selling(asset:IAsset, price:number) {
		var bag = asset.getSettings().bag;
		bag.ask = Number(asset.getTradeHighest().price);
		log.debug(asset.getSymbol(), 'selling', bag.ask, bag.ask - (bag.ask * asset.getSettings().strategy.sell.trail));
		var stop = bag.ask - (bag.ask * asset.getSettings().strategy.sell.trail);
		if(price < stop && price >= bag.ask0) {
			// immediately place order
			var book = asset.getOrderBook();
			var ask = book.asks[0].price;
			var quantity = bag.quantity;
			var order = wait.for.promise(this._exchange.placeSellLimit(asset.getSymbol(), quantity, ask));
			if(order != null) {
				bag.order = {
					'side': 'SELL',
					'orderId': order.orderId,
					'price': Number(order.price),
					'quantity': Number(order.origQty)
				}
				log.info('sell limit', asset.getSymbol(), quantity, ask, bag.order);
				bag.position = POSITION.ASKING;
			} else {
				log.error('sell limit error', asset.getSymbol(), quantity, ask, price);
				bag.position = POSITION.SELL;
			}
		} else if(price < bag.ask0) {
			bag.position = POSITION.SELL;
		}
	}
    private _asking(asset:IAsset, price:number) {
		var bag = asset.getSettings().bag;
		var order = bag.order;
		if(order != null && bag.position == POSITION.ASKING) {
			var book = asset.getOrderBook();
			var bid0 = book.bids[0];
			var ask0 = book.asks[0];
			log.debug('asking', asset.getSymbol(), order.price, ask0.price, ask0.quantity, bid0.quantity, ask0.quantity / bid0.quantity);	
			if(order.price > ask0.price && (ask0.quantity / bid0.quantity) > 1.1) {
				var cancel = wait.for.promise(this._exchange.cancelOrder(asset.getSymbol(), order.orderId));
				if(cancel != null) {
					asset.clearOrder();
					this._sell(asset, price); // check whether still OK to sell
				}
			}
		}
    }
    private _dca(asset:IAsset, price:number) {
		var bag = asset.getSettings().bag;

		if(bag.dca.enabled === false || bag.dca.levels.length == 0) {
			// concentrate on selling since cannot DCA anymore
			bag.position = POSITION.SELL;
		} else {
			var nextDCAPrice = bag.cost + (bag.cost * bag.dca.levels[0]);
			log.debug('dca', asset.getSymbol(), '@', nextDCAPrice);
			if (price <= nextDCAPrice) {
				asset.getSettings().bag.position = POSITION.BUYING;
				asset.getSettings().bag.bid = price;
				asset.getSettings().bag.bid0 = price;
				log.debug('dca', asset.getSymbol(), '@', price);
				bag.dca.levels.shift();
			}
		}
	}
    private _onFilledOrder(data:any) {
		log.info('bag', data.executionType, data.orderId);
		var asset = this._exchange.getAssets()[data.symbol];
		var settings = asset.getSettings();
		if(settings.bag.order == null) return; // don't have an order at hand, so the filled order must be manually placed.
		// otherwise, check whether we are cancelling the order we are currently tracking,
		if(data.orderId == settings.bag.order.orderId) {
			asset.clearOrder();
			log.info('bag', data.executionType, data.orderId, asset.getSettings().bag.quantity, asset.getSettings().bag.cost);
		} // otherwise, it is some other order we don't have to care about.
	}

	private _onCancelOrder(data:any) {
		log.info('bag', data.executionType, data.orderId);
		var asset = this._exchange.getAssets()[data.symbol];
		var settings = asset.getSettings();
		if(settings.bag.order == null) return; // don't have an order at hand, so the filled order must be manually placed.
		// otherwise, check whether we are cancelling the order we are currently tracking,
		if(data.orderId == settings.bag.order.orderId) {
			asset.clearOrder();
			log.info('bag', data.executionType, data.orderId, asset.getSettings().bag.quantity, asset.getSettings().bag.cost);
		} // otherwise, it is some other order we don't have to care about.
    }
    
    private _getTechnicalAnalysis(asset:IAsset) {
		var macd = null; var bb = null; var rsi = null;
		var emafast = null; var emaslow = null;
		var indicator = asset.getSettings().indicator;
		var strategy = asset.getSettings().strategy;
		var closes = _.map(asset.getKlines(), (kline:IKline) => { return Number(kline.close); });
		
		if(strategy.buy.macd.enabled === true) {
			var macdInput = {
				'values': closes,
				'fastPeriod': indicator.macd.fastPeriod,
				'slowPeriod': indicator.macd.slowPeriod,
				'signalPeriod': indicator.macd.signalPeriod,
				'SimpleMAOscillator': false,
	  			'SimpleMASignal': false,
			}
			macd = _.takeRight(MACD.calculate(macdInput), 3); // we need this many data points to decide on buy
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