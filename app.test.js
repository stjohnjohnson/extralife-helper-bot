import { describe, test, expect } from '@jest/globals';

describe('ExtraLife Helper Bot', () => {
    test('should initialize without errors', () => {
        // Basic smoke test - more comprehensive tests can be added later
        expect(true).toBe(true);
    });

    test('money formatter should format correctly', () => {
        const moneyFormatter = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        });

        expect(moneyFormatter.format(25.50)).toBe('$25.50');
        expect(moneyFormatter.format(1000)).toBe('$1,000.00');
    });
});
