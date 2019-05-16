import { Bootstrap } from '../build/Bootstrap'
import * as _ from 'lodash';

describe('Bootstrap', () => {

    var bootstrap;
    var config:any;

    beforeEach(() => {
        bootstrap = new Bootstrap();
        config = bootstrap.getConfig();
    })
    
    it('must have valid config', () => {
        expect(config).toBeDefined();
        expect(_.isObject(config)).toBe(true);
    });

    it('must have symbol config', () => {
        expect(config.hasOwnProperty('symbols')).toBe(true);
        expect(_.isArray(config.symbols)).toBe(true);
        expect(config.symbols.length > 0).toBe(true);
    });

    it('must have strategy config for every symbol', () => {
        _.forEach(config.symbols, (symbol:string) => {
            expect(config.hasOwnProperty(symbol)).toBe(true);
            expect(config[symbol].hasOwnProperty('strategy')).toBe(true);
            expect(config[symbol].hasOwnProperty('strategy')).toBe(true);
            expect(config[symbol].strategy.hasOwnProperty('buy')).toBe(true);
            expect(config[symbol].strategy.hasOwnProperty('sell')).toBe(true);
            expect(config[symbol].strategy.hasOwnProperty('dca')).toBe(true);
            expect(config[symbol].strategy.buy.hasOwnProperty('enabled')).toBe(true);
            expect(config[symbol].strategy.sell.hasOwnProperty('enabled')).toBe(true);
            expect(config[symbol].strategy.dca.hasOwnProperty('enabled')).toBe(true);
        });
    });

    it('must have frequency setting for every symbol', () => {
        _.forEach(config.symbols, (symbol:string) => {
            expect(config[symbol].hasOwnProperty('frequency')).toBe(true);
            expect(config[symbol].frequency > 0).toBe(true);
        });
    });

    it('must have bag setting for every symbol', () => {
        _.forEach(config.symbols, (symbol:string) => {
            expect(config[symbol].hasOwnProperty('bag')).toBe(true);
            expect(config[symbol].bag.hasOwnProperty('quantity')).toBe(true);
            expect(config[symbol].bag.hasOwnProperty('cost')).toBe(true);
            expect(_.isNumber(config[symbol].bag.quantity)).toBe(true);
            expect(_.isNumber(config[symbol].bag.cost)).toBe(true);
        });
    });

    it('must have proper indicator settings for every symbol', () => {
        _.forEach(config.symbols, (symbol:string) => {
            expect(config[symbol].hasOwnProperty('indicator')).toBe(true);
            expect(config[symbol].indicator.hasOwnProperty('kline')).toBe(true);
            expect(config[symbol].indicator.hasOwnProperty('bb')).toBe(true);
            expect(config[symbol].indicator.hasOwnProperty('macd')).toBe(true);
            expect(config[symbol].indicator.hasOwnProperty('rsi')).toBe(true);
            expect(config[symbol].indicator.hasOwnProperty('ema')).toBe(true);

            var klineIntervals = ['1m', '5m', '10m', '1d', '1w']; // allowed values
            expect(_.indexOf(klineIntervals, config[symbol].indicator.kline.interval) >= 0).toBe(true);

            // macd and ema parameters
            expect(config[symbol].indicator.macd.hasOwnProperty('fastPeriod')).toBe(true);
            expect(config[symbol].indicator.macd.hasOwnProperty('slowPeriod')).toBe(true);
            expect(config[symbol].indicator.ema.hasOwnProperty('fastPeriod')).toBe(true);
            expect(config[symbol].indicator.ema.hasOwnProperty('slowPeriod')).toBe(true);
            var fast = config[symbol].indicator.macd.fastPeriod;
            var slow = config[symbol].indicator.macd.slowPeriod;
            expect(_.isNumber(fast)).toBe(true);
            expect(_.isNumber(slow)).toBe(true);
            expect(fast < slow).toBe(true);
            fast = config[symbol].indicator.ema.fastPeriod;
            slow = config[symbol].indicator.ema.slowPeriod;
            expect(_.isNumber(fast)).toBe(true);
            expect(_.isNumber(slow)).toBe(true);
            expect(fast < slow).toBe(true);
        });        
    });

    it('must proper settings for buy strategy', () => {
        _.forEach(config.symbols, (symbol:string) => {
            expect(_.isBoolean(config[symbol].strategy.buy.enabled)).toBe(true);
            expect(config[symbol].strategy.buy.hasOwnProperty('minCost')).toBe(true);
            expect(config[symbol].strategy.buy.hasOwnProperty('maxCost')).toBe(true);
            expect(config[symbol].strategy.buy.hasOwnProperty('maxBuySpread')).toBe(true);
            expect(config[symbol].strategy.buy.hasOwnProperty('trail')).toBe(true);
            expect(config[symbol].strategy.buy.minCost <= config[symbol].strategy.buy.maxCost);
            expect(config[symbol].strategy.buy.maxBuySpread >= 0).toBe(true);
            expect(config[symbol].strategy.buy.trail >= 0).toBe(true);
        });
    });

    it('must have proper buy triggers', () => {
        _.forEach(config.symbols, (symbol:string) => {
            expect(_.isNumber(config[symbol].strategy.buy.bb.trigger)).toBe(true);
            expect(_.isNumber(config[symbol].strategy.buy.macd.trigger)).toBe(true);
            expect(_.isNumber(config[symbol].strategy.buy.rsi.trigger)).toBe(true);
            expect(_.isNumber(config[symbol].strategy.buy.emafast.trigger)).toBe(true);
            expect(_.isNumber(config[symbol].strategy.buy.emaslow.trigger)).toBe(true);
            expect(_.isNumber(config[symbol].strategy.buy.emaspread.trigger)).toBe(true);
        });
    });

    it('must have proper settings for sell strategy', () => {
        _.forEach(config.symbols, (symbol:string) => {
            expect(_.isBoolean(config[symbol].strategy.sell.enabled)).toBe(true);
            expect(config[symbol].strategy.sell.hasOwnProperty('trail')).toBe(true);
            expect(config[symbol].strategy.sell.trail >= 0).toBe(true);
        });
    });

    it('must have proper settings for dca strategy', () => {
        _.forEach(config.symbols, (symbol:string) => {
            expect(config[symbol].strategy.dca.hasOwnProperty('levels')).toBe(true);
            expect(_.isArray(config[symbol].strategy.dca.levels)).toBe(true);
        });
    });
});