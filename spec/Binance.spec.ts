import * as binance from 'binance';
import { Binance } from '../build/exchange/Binance';
import { getConsoleOutput } from '@jest/console';
jest.mock('binance');

describe('Binance', () => {
    var config = {
        symbols: ['BTCUSD'],
        quote: 'USD',
        binance: {
            key: 'xxx_key_xxx',
            secret: 'xxx_secret_xxx'
        },
        'BTCUSD': {
            bag: { quantity: NaN, cost: NaN }
        }
    };

   it('must connect to binance api when constructed', () => {
        var exchange = new Binance(config);
        expect(binance.BinanceRest).toHaveBeenCalledTimes(1);
        expect(binance.BinanceWS).toHaveBeenCalledTimes(1);
   });

   xit('must automatically calculate bag cost and quantity from trade history when not specified in config', () => {
        var exchange = new Binance(config);
        exchange.start();
        expect(binance.BinanceWS).toHaveBeenCalledTimes(1);
   });

   it('must place sell limit', () => {
       var exchange = new Binance(config);
       exchange.placeSellLimit("BTCUSD", 100, 200).then((data) => {
            expect(data).toBeDefined();
            throw data;
       }).catch((err) => {
            throw err;
       });
   });
});