import * as _ from "lodash";

describe('config file', ()=> {
    var config = require('../src/config/default.js');

    it('should have buy and sell strategies', () => {
        console.log(config);
        expect(config.default.strategy.hasOwnProperty('buy')).toBe(true);
        expect(config.default.strategy.hasOwnProperty('sell')).toBe(true);
    });
});