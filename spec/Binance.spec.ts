import { BinanceRest, BinanceWS } from 'binance';
import { Binance } from '../build/exchange/Binance';
jest.genMockFromModule('binance');
BinanceRest.mockImplementation(() => { data: 'happy' })
BinanceWS.mockImplementation(() => { data: 'sad' })

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
        expect(BinanceRest).toHaveBeenCalledTimes(1);
        expect(BinanceRest).toReturnWith("apple");
        expect(BinanceWS).toHaveBeenCalledTimes(1);
   });

   xit('must automatically calculate bag cost and quantity from trade history when not specified in config', () => {
        var exchange = new Binance(config);
        exchange.start();
        expect(BinanceWS).toHaveBeenCalledTimes(1);
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