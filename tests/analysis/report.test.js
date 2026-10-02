const { renderHtml, stableStringify } = require('../../src/analysis/report.js');

describe('analysis report rendering', () => {
    const report = {
        schemaVersion: 1,
        source: { name: 'event.log', lineCount: 3 },
        metrics: {
            eventWindow: { start: '2025-11-01T10:00:00.000Z', end: '2025-11-01T11:00:00.000Z' },
            overview: { durationMinutes: 60, averageViewers: 10, peakViewers: 20, humanChatMessages: 2, uniqueChatters: 1, donationCount: 1, donationTotal: 25 },
            games: [{ game: '</script><img src=x onerror=alert(1)>', durationMinutes: 60, eligibleForRanking: true, viewer: { average: 10, peak: 20, retentionPercent: 80 }, chat: { messagesPerHour: 2, uniqueChattersPerHour: 1 }, donations: { total: 25, dollarsPerHour: 25 } }],
            timeline: [{ start: '2025-11-01T10:00:00.000Z', end: '2025-11-01T10:15:00.000Z', averageViewers: 10 }],
            transitions: [{ from: 'PEAK', to: 'Minecraft', timestamp: '2025-11-01T10:30:00.000Z', included: true, reason: null, before: { medianViewers: 10, chatMessages: 2, uniqueChatters: 1 }, after: { medianViewers: 12, chatMessages: 3, uniqueChatters: 2 } }],
            rankings: { averageViewers: ['PEAK'], viewerRetention: ['PEAK'], chatRate: ['PEAK'], uniqueChatRate: ['PEAK'], donationRate: ['PEAK'] },
            chat: { humanMessages: 2, botMessages: 0, uniqueChatters: 1, topChatters: [], topWords: [], topBigrams: [] },
            donations: { count: 1, total: 25, average: 25, median: 25, largest: 25, startupCount: 0, ambiguousCount: 0, items: [{ timestamp: '2025-11-01T10:10:00.000Z', displayName: 'Alice', amount: 25, message: '<strong>Go!</strong>' }] },
            diagnostics: { coverageGaps: [], excludedSessions: [] }
        },
        diagnostics: { unknownLines: [], malformedLines: [], ambiguousTimestamps: [], duplicateEvents: [] },
        events: []
    };

    test('produces byte-stable JSON and HTML', () => {
        expect(stableStringify(report)).toBe(stableStringify({ ...report }));
        expect(renderHtml(report, 'America/Los_Angeles')).toBe(renderHtml(report, 'America/Los_Angeles'));
    });

    test('escapes private text and contains no remote assets', () => {
        const html = renderHtml(report, 'America/Los_Angeles');

        expect(html).toContain('Private local report');
        expect(html).toContain('&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;');
        expect(html).not.toContain('</script><img');
        expect(html).not.toContain('undefined');
        expect(html).not.toMatch(/(?:src|href)=["']https?:/i);
        expect(html).toContain('<svg');
        expect(html).toContain('Game rankings');
        expect(html).toContain('Transition impact');
        expect(html).toContain('Alice');
        expect(html).toContain('&lt;strong&gt;Go!&lt;/strong&gt;');
    });
});
