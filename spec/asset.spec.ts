import * as _ from "lodash";
import { Asset } from "../build/exchange/Asset";

describe('Binance Asset', ()=> {

    var asset;

    beforeEach(() => {
        asset = new Asset('BTCUSD', {

        });
    });

    it('must provide symbol', () => {
        var symbol = asset.getSymbol();
        expect(symbol).toBe('BTCUSD');
    });
});