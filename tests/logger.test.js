let mockFormatter;
const mockChild = jest.fn(({ module }) => ({ module }));

jest.mock('winston', () => ({
    createLogger: jest.fn(() => ({ child: mockChild })),
    format: {
        combine: jest.fn((...formats) => formats),
        timestamp: jest.fn(() => 'timestamp-format'),
        errors: jest.fn(() => 'errors-format'),
        splat: jest.fn(() => 'splat-format'),
        printf: jest.fn(formatter => {
            mockFormatter = formatter;
            return 'printf-format';
        })
    },
    transports: {
        Console: jest.fn(function Console(options) {
            this.options = options;
        })
    }
}));

const getLogger = require('../logger.js');

describe('logger', () => {
    test('creates module-scoped child loggers', () => {
        expect(getLogger('discord')).toEqual({ module: 'discord' });
        expect(mockChild).toHaveBeenCalledWith({ module: 'discord' });
    });

    test('formats module metadata for human-readable structured logs', () => {
        expect(mockFormatter({
            timestamp: '2026-10-02T00:00:00.000Z',
            level: 'info',
            message: 'Connected',
            module: 'twitch',
            channel: 'extra-life'
        })).toBe('2026-10-02T00:00:00.000Z [twitch] INFO: Connected {"channel":"extra-life"}');

        expect(mockFormatter({
            timestamp: '2026-10-02T00:00:00.000Z',
            level: 'warn',
            message: 'Retrying'
        })).toBe('2026-10-02T00:00:00.000Z [app] WARN: Retrying');
    });
});
