import * as _ from "lodash";
import * as log from "loglevel";
import * as wait from "wait-for-stuff";
import {IAsset, IKline, POSITION, IExchange} from "./exchange/IExchange";
import * as technical from "technicalindicators";
var MACD = technical.MACD;
var BB = technical.BollingerBands;
var RSI = technical.RSI;
var EMA = technical.EMA;

export interface IStrategy {
    // Buy Strategy is used when Trader is waiting to buy. The Strategy returns boolean indicating whether Trader should change position to buying.
    buy(asset:IAsset, price:number):void;
    // Buying Strategy is used when Trader is waiting for the best price to bid. The Strategy returns boolean indicating whether Trader should place bid.
    buying(asset:IAsset, price:number, exchange:IExchange):void;
    bidding(asset:IAsset, price:number, exchange:IExchange):void;
    // should sell or not
    sell(asset:IAsset, price:number):boolean;
    selling(asset:IAsset, price:number, exchange:IExchange):void;
    asking(asset:IAsset, price:number, exchange:IExchange):void;
}

export class Strategy implements IStrategy {
    public buy(asset: IAsset, price: number): void {

        var buyStrategy = asset.getSettings().strategy.buy;		
		if (buyStrategy.enabled === false) {
			log.info("buy disabled", asset.getSymbol());
			return;
		}
		log.debug('action=buy, asset=%s, price=%d', asset.getSymbol(), price);
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
			log.debug("rsi", tech.rsi[0]);
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
			log.debug("emaspread", level, "fast:", tech.emafast, "slow:", tech.emaslow);
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
			log.debug("emaslow", level);
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
			asset.resetDCA(); // TODO: this should be called when trader successfully buy asset
		}
    }
    public buying(asset: IAsset, price: number, exchange:IExchange): void {
        var bag = asset.getSettings().bag;
		bag.bid = Number(asset.getTradeLowest().price); // update lowest price
		var stop = bag.bid + (bag.bid * asset.getSettings().strategy.buy.trail);
		// trail the falling prices to enter at lowest possible price
		log.debug('action=buying, asset=%s, trigger=%d, best=%d, price=%d, stop=%d', asset.getSymbol(), bag.bid0, bag.bid, price, bag.bid + (bag.bid * asset.getSettings().strategy.buy.trail));
		if(price >= stop && price <= bag.bid0) {
			// make sure price is less than bag cost otherwise, the overall cost will increase!
			// once OK, immediately place order
			var book = asset.getOrderBook();
			var bid = book.bids[0].price;
			var ask = book.asks[0].price;
			if((ask / bid) - 1 < asset.getSettings().strategy.buy.maxBuySpread) { // prevent pump
				var quantity = asset.getSettings().strategy.buy.minCost / bid;
				quantity = bag.quantity > 0 ? 2 * bag.quantity : quantity; // if bag is not empty, it means we are doing DCA, so double the quantity to buy
				quantity = asset.getAdjustedLotSize(quantity);
				var order = wait.for.promise(exchange.placeBuyLimit(asset.getSymbol(), quantity, bid));
				if(order != null) {
					bag.order = {
						'side': 'BUY',
						'orderId': order.orderId,
						'price': Number(order.price),
						'quantity': Number(order.origQty)
					}
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
    public bidding(asset: IAsset, price: number, exchange:IExchange): void {
        var bag = asset.getSettings().bag;
		var order = bag.order;
		if(order != null && bag.position == POSITION.BIDDING) {
			var book = asset.getOrderBook();
			var bid0 = book.bids[0];
			var ask0 = book.asks[0];
			log.debug('action=bidding, asset=%s, orderBid=%d, highBid=%d, qtyBid=%d, qtyAsk=%d, qtyMargin=%d', asset.getSymbol(), order.price, bid0.price, bid0.quantity, ask0.quantity, bid0.quantity / ask0.quantity);
			if(order.price < bid0.price && (bid0.quantity / ask0.quantity) > 1.1) {
				var cancel = wait.for.promise(exchange.cancelOrder(asset.getSymbol(), order.orderId));
				if(cancel != null) {
					asset.clearOrder();
					this.buy(asset, price); // check whether still OK to buy
				}
			}
		}
    }
    public sell(asset: IAsset, price: number): boolean {
        var sellStrategy = asset.getSettings().strategy.sell;
		if(sellStrategy.enabled === false) {
			log.info("sell disabled", asset.getSymbol());
			return false; // return shouldSell = false
		}
		var shouldSell = true;

		var cost = asset.getSettings().bag.cost;
		var quantity = asset.getSettings().bag.quantity;

		if(shouldSell && sellStrategy.gain.enabled == true) {
			var targetsell = cost * sellStrategy.gain.target;
			if(price <= targetsell) {
				log.debug('action=sell, asset=%s, cost=%d, price=%d, target=%d', asset.getSymbol(), cost, price, targetsell);
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
    public selling(asset: IAsset, price: number, exchange:IExchange): void {
        var bag = asset.getSettings().bag;
		bag.ask = Number(asset.getTradeHighest().price);
		log.debug('action=selling, asset=%s, quantity=%d, ask=%d, stop=%d', asset.getSymbol(), bag.quantity, bag.ask, bag.ask - (bag.ask * asset.getSettings().strategy.sell.trail));
		var stop = bag.ask - (bag.ask * asset.getSettings().strategy.sell.trail);
		if(price < stop && price >= bag.ask0) {
			// immediately place order
			var book = asset.getOrderBook();
			var ask = book.asks[0].price;
			var quantity = bag.quantity;
			var order = wait.for.promise(exchange.placeSellLimit(asset.getSymbol(), quantity, ask));
			if(order != null) {
				bag.order = {
					'side': 'SELL',
					'orderId': order.orderId,
					'price': Number(order.price),
					'quantity': Number(order.origQty)
				}
				bag.position = POSITION.ASKING;
			} else {
				log.error('sell limit error', asset.getSymbol(), quantity, ask, price);
				bag.position = POSITION.SELL;
			}
		} else if(price < bag.ask0) {
			bag.position = POSITION.SELL;
		}
    }
    public asking(asset: IAsset, price: number, exchange:IExchange): void {
        var bag = asset.getSettings().bag;
		var order = bag.order;
		if(order != null && bag.position == POSITION.ASKING) {
			var book = asset.getOrderBook();
			var bid0 = book.bids[0];
			var ask0 = book.asks[0];
			log.debug('action=asking, asset=%s, orderAsk=%d, lowAsk=%d, qtyAsk=%d, qtyBid=%d, qtyMargin=%d', asset.getSymbol(), order.price, ask0.price, ask0.quantity, bid0.quantity, ask0.quantity / bid0.quantity);
			if(order.price > ask0.price && (ask0.quantity / bid0.quantity) > 1.1) {
				var cancel = wait.for.promise(exchange.cancelOrder(asset.getSymbol(), order.orderId));
				if(cancel != null) {
					asset.clearOrder();
					this.sell(asset, price); // check whether still OK to sell
				}
			}
		}
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