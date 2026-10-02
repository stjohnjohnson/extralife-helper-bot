const { parseArguments } = require('../../src/analysis/options.js');

describe('analysis CLI options', () => {
    test('applies repository bot defaults when no bot options are supplied', () => {
        expect(parseArguments(['event.log']).botUsers).toEqual(['stjohnbot', 'streamelements']);
    });

    test('merges custom bot users with deterministic repository defaults', () => {
        expect(parseArguments(['event.log', '--bot-user', 'helper', '--bot-user', 'StreamElements'])).toEqual({
            inputPath: 'event.log',
            outputDir: 'reports',
            timezone: 'America/Los_Angeles',
            botUsers: ['helper', 'stjohnbot', 'streamelements'],
            start: null,
            end: null
        });
    });

    test.each([
        [[], 'Usage:'],
        [['event.log', '--timezone', 'Mars/Olympus'], 'Invalid timezone'],
        [['event.log', '--start', '2025-11-01T00:00:00Z'], '--start and --end must be provided together'],
        [['event.log', '--wat'], 'Unknown option']
    ])('rejects invalid arguments %#', (args, message) => {
        expect(() => parseArguments(args)).toThrow(message);
    });

    test('accepts a complete manual UTC window', () => {
        const result = parseArguments([
            'event.log',
            '--start', '2025-11-01T16:25:30Z',
            '--end', '2025-11-02T17:32:23Z',
            '--output-dir', 'private-report'
        ]);

        expect(result.start).toBe('2025-11-01T16:25:30.000Z');
        expect(result.end).toBe('2025-11-02T17:32:23.000Z');
        expect(result.outputDir).toBe('private-report');
    });
});
