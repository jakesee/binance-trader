import { compute } from './compute';

// test suite - group of related tests
describe('compute', () => {
    // spec or a test
    it('should return 0 if input is negative', () => {
        const result = compute(-1);
        expect(result).toBe(0);
    });
});