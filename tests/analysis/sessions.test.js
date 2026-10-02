const { buildSessions } = require('../../src/analysis/sessions.js');

function viewer(timestamp, startedAt, game, title = 'Marathon') {
    return {
        type: 'viewer_sample', timestamp, line: 1, confidence: 'exact',
        data: { channel: 'example', title, startedAt, game, viewerCount: 10 }
    };
}

function change(timestamp, oldGame, newGame) {
    return {
        type: 'game_change', timestamp, line: 1, confidence: 'exact', data: { oldGame, newGame }
    };
}

describe('event session builder', () => {
    test('stitches a brief restart and selects the longest event', () => {
        const events = [
            viewer('2025-10-29T05:30:00Z', '2025-10-29T05:27:00Z', 'Minecraft', 'Test'),
            viewer('2025-10-29T05:35:00Z', '2025-10-29T05:27:00Z', 'Minecraft', 'Test'),
            viewer('2025-11-01T16:30:00Z', '2025-11-01T16:25:30Z', 'PEAK'),
            viewer('2025-11-01T16:35:00Z', '2025-11-01T16:25:30Z', 'PEAK'),
            viewer('2025-11-01T16:43:00Z', '2025-11-01T16:40:30Z', 'PEAK'),
            viewer('2025-11-01T16:48:00Z', '2025-11-01T16:40:30Z', 'PEAK'),
            change('2025-11-01T16:52:00Z', 'PEAK', 'none')
        ];

        const result = buildSessions(events);

        expect(result.selected).toMatchObject({
            start: '2025-11-01T16:25:30.000Z',
            end: '2025-11-01T16:52:00.000Z',
            viewerSampleCount: 4,
            stitchedSessionCount: 2
        });
        expect(result.excluded).toHaveLength(1);
        expect(result.excluded[0].title).toBe('Test');
    });

    test('reports missing coverage beyond twice the median cadence', () => {
        const events = [
            viewer('2025-11-01T10:00:00Z', '2025-11-01T10:00:00Z', 'PEAK'),
            viewer('2025-11-01T10:05:00Z', '2025-11-01T10:00:00Z', 'PEAK'),
            viewer('2025-11-01T10:10:00Z', '2025-11-01T10:00:00Z', 'PEAK'),
            viewer('2025-11-01T10:25:01Z', '2025-11-01T10:00:00Z', 'PEAK')
        ];

        const result = buildSessions(events);

        expect(result.gaps).toEqual([{
            start: '2025-11-01T10:10:00.000Z',
            end: '2025-11-01T10:25:01.000Z',
            durationMs: 901000
        }]);
    });

    test('uses a paired manual window when no viewer session exists', () => {
        const result = buildSessions([], {
            start: '2025-11-01T10:00:00.000Z',
            end: '2025-11-01T11:00:00.000Z'
        });

        expect(result.selected).toMatchObject({
            source: 'manual',
            start: '2025-11-01T10:00:00.000Z',
            end: '2025-11-01T11:00:00.000Z',
            viewerSampleCount: 0
        });
    });

    test('collapses short presence loss into a direct game change', () => {
        const events = [
            viewer('2025-11-01T10:00:00Z', '2025-11-01T10:00:00Z', 'PEAK'),
            viewer('2025-11-01T10:05:00Z', '2025-11-01T10:00:00Z', 'PEAK'),
            change('2025-11-01T10:06:00Z', 'PEAK', 'none'),
            change('2025-11-01T10:06:30Z', 'none', 'Minecraft'),
            viewer('2025-11-01T10:10:00Z', '2025-11-01T10:00:00Z', 'Minecraft'),
            viewer('2025-11-01T10:15:00Z', '2025-11-01T10:00:00Z', 'Minecraft')
        ];

        const result = buildSessions(events);

        expect(result.gameSegments.map(segment => ({ game: segment.game, start: segment.start }))).toEqual([
            { game: 'PEAK', start: '2025-11-01T10:00:00.000Z' },
            { game: 'Minecraft', start: '2025-11-01T10:06:30.000Z' }
        ]);
    });

    test('throws when no session or manual window can be identified', () => {
        expect(() => buildSessions([])).toThrow('No live stream session detected');
    });
});
