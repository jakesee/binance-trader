export class POSITIONS {
    static readonly ANALYZING: 0;
    static readonly TRAILING: 0b000010010;
    // when bag is empty, switch to buy mode
    static readonly ANYBUY: 0b000000111;
    static readonly BUY: 0b000000001;
    static readonly BUYING: 0b000000010;
    static readonly BIDDING: 0b000000100;
    // when bag is not empty, switch to sell mode
    static readonly ANYSELL: 0b000111000;
    static readonly SELL: 0b000001000;
    static readonly SELLING: 0b000010000;
    static readonly ASKING: 0b000100000;;
    // when current price fall belows average bag cost, switch to DCA mode
    static readonly ANYDCA: 0b111000000;
    static readonly DCA: 0b001000000;
    static readonly DCABUYING: 0b010000000;
    static readonly DCABIDDING: 0b100000000
}