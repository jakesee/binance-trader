import * as _ from "lodash";
import * as log from "loglevel";
import * as tick from "animation-loops";
import * as wait from "wait-for-stuff";
import {IExchange, IAsset, POSITION, IKline, ISettings, IBag} from "./exchange/IExchange";
import {IStrategy} from "./Strategy";

export class Trader {
	constructor(private _exchange:IExchange, private _defaultStrategy:IStrategy, private _strategy:{[key: string]:IStrategy} = {}) {
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
				var strategy:IStrategy = (key in this._strategy) ? this._strategy[key] : this._defaultStrategy;

				if(position == POSITION.BUYING) {
					strategy.buying(asset, price, this._exchange); // trailing buy, buying the lowest possible
				} else if(position == POSITION.BIDDING) {
					strategy.bidding(asset, price, this._exchange); // bid placed, waiting for taker
				} else if(position == POSITION.SELLING) {
					strategy.selling(asset, price, this._exchange); // trailing sell if price goes up;
				} else if(position == POSITION.ASKING) {
					strategy.asking(asset, price, this._exchange); // asking price offered, waiting for taker
				} else if(position == POSITION.SELL) {
					strategy.sell(asset, price);
				} else if (asset.shouldSell() && !strategy.sell(asset, price)) { // there are items in bag, need to sell off
					this._dca(asset, price); // do technical analysis to see if good to buy	
				} else {
					strategy.buy(asset, price); // do technical analysis to see if good to buy
				}
			});
		});
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
}