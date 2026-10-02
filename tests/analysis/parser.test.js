const { parseLog } = require('../../src/analysis/parser.js');

describe('log parser', () => {
    test('parses Docker-prefixed viewer, game, chat, and live donation records', () => {
        const input = [
            'bot-1 | 2025-11-01T23:58:00.000Z [twitch] INFO: Stream viewer count {"channel":"example","viewerCount":12,"game":"PEAK","title":"Marathon","startedAt":"2025-11-01T23:00:00Z"}',
            'bot-1 | 2025-11-01T23:59:00.000Z [extralife] INFO: Donation: Alice / $25.00 with the message "Go / team!"',
            'bot-1 | [23:59] info: [#example] <helperbot>: ExtraLife ExtraLife Alice just donated $25.00 with the message "Go / team!"! ExtraLife ExtraLife',
            'bot-1 | 2025-11-01T23:59:05.000Z [discord] INFO: Updating Discord status: "$25.00 (10%) Raised"',
            'bot-1 | 2025-11-02T00:01:00.000Z [discord] INFO: Game change detected {"oldGame":"PEAK","newGame":"Minecraft"}',
            'bot-1 | [00:02] info: [#example] <alice>: hello world'
        ].join('\n');

        const result = parseLog(input);

        expect(result.lineCount).toBe(6);
        expect(result.events.map(event => event.type)).toEqual([
            'viewer_sample', 'donation', 'chat_message', 'game_change', 'chat_message'
        ]);
        expect(result.events[1].data).toMatchObject({
            displayName: 'Alice',
            amount: 25,
            message: 'Go / team!',
            classification: 'live'
        });
        expect(result.events[4]).toMatchObject({
            timestamp: '2025-11-02T00:02:00.000Z',
            confidence: 'inferred',
            data: { username: 'alice', text: 'hello world', channel: 'example' }
        });
        expect(result.diagnostics.unknownLines).toEqual([]);
    });

    test('parses versioned structured metadata and deduplicates donation IDs', () => {
        const line = '2025-11-01T10:00:00.000Z [extralife] INFO: Donation received {"eventVersion":1,"eventType":"donation","donationId":"d-1","amount":55,"displayName":"Bob","message":"Hi","silent":false}';
        const result = parseLog(`${line}\n${line}`);

        expect(result.events).toHaveLength(1);
        expect(result.events[0]).toMatchObject({
            type: 'donation',
            timestamp: '2025-11-01T10:00:00.000Z',
            confidence: 'exact',
            data: { donationId: 'd-1', amount: 55, classification: 'live' }
        });
        expect(result.diagnostics.duplicateEvents).toEqual([{ line: 2, key: 'donation:d-1' }]);
    });

    test('keeps startup and ambiguous donations out of confirmed live totals', () => {
        const input = [
            '2025-11-01T09:00:00.000Z [app] INFO: ExtraLife Helper Bot starting for participant 1',
            '2025-11-01T09:00:01.000Z [extralife] INFO: Donation: Prior Donor / $100.00',
            '2025-11-01T10:00:00.000Z [extralife] INFO: Donation: Unconfirmed / $20.00',
            'unrecognized line'
        ].join('\n');

        const result = parseLog(input);

        expect(result.events.filter(event => event.type === 'donation').map(event => event.data.classification)).toEqual([
            'startup', 'ambiguous'
        ]);
        expect(result.diagnostics.unknownLines).toEqual([{ line: 4, text: 'unrecognized line' }]);
    });

    test('promotes a startup-period donation when its live notification is confirmed', () => {
        const result = parseLog([
            '2025-11-01T09:00:00.000Z [app] INFO: ExtraLife Helper Bot starting for participant 1',
            '2025-11-01T09:00:30.000Z [extralife] INFO: Donation: Fast Donor / $25.00',
            '[09:00] info: [#example] <helperbot>: ExtraLife ExtraLife Fast Donor just donated $25.00! ExtraLife ExtraLife',
            '2025-11-01T09:00:35.000Z [discord] INFO: Updating Discord status: "$25.00 (10%) Raised"'
        ].join('\n'));

        expect(result.events.find(event => event.type === 'donation').data.classification).toBe('live');
    });

    test('marks chat without a dated anchor as ambiguous', () => {
        const result = parseLog('[12:34] info: [#example] <alice>: hi');

        expect(result.events[0]).toMatchObject({
            type: 'chat_message',
            timestamp: null,
            confidence: 'ambiguous'
        });
        expect(result.diagnostics.ambiguousTimestamps).toEqual([1]);
    });

    test('records malformed structured metadata without throwing', () => {
        const result = parseLog('2025-11-01T10:00:00.000Z [twitch] INFO: Broken {"eventVersion":1');

        expect(result.events).toEqual([]);
        expect(result.diagnostics.malformedLines).toEqual([{ line: 1, reason: 'invalid JSON metadata' }]);
    });
});
