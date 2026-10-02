const { renderHtml, stableStringify } = require('../../src/analysis/report.js');

describe('analysis report rendering', () => {
    const report = {
        schemaVersion: 1,
        source: { name: 'event.log', lineCount: 3 },
        sessions: {
            gameSegments: [
                { game: 'PEAK', start: '2025-11-01T10:00:00.000Z', end: '2025-11-01T10:30:00.000Z', durationMs: 1_800_000 },
                { game: 'Minecraft & Friends', start: '2025-11-01T10:30:00.000Z', end: '2025-11-01T11:00:00.000Z', durationMs: 1_800_000 }
            ]
        },
        metrics: {
            eventWindow: { start: '2025-11-01T10:00:00.000Z', end: '2025-11-01T11:00:00.000Z' },
            overview: { durationMinutes: 60, averageViewers: 10, peakViewers: 20, humanChatMessages: 2, uniqueChatters: 1, donationCount: 1, donationTotal: 25 },
            games: [{ game: '</script><img src=x onerror=alert(1)>', durationMinutes: 60, eligibleForRanking: true, viewer: { average: 10, peak: 20, retentionPercent: 80 }, chat: { messagesPerHour: 2, uniqueChattersPerHour: 1 }, donations: { total: 25, dollarsPerHour: 25 } }],
            timeline: [
                { start: '2025-11-01T10:00:00.000Z', end: '2025-11-01T10:15:00.000Z', averageViewers: 10 },
                { start: '2025-11-01T10:45:00.000Z', end: '2025-11-01T11:00:00.000Z', averageViewers: 20 }
            ],
            transitions: [{ from: 'PEAK', to: 'Minecraft', timestamp: '2025-11-01T10:30:00.000Z', included: true, reason: null, before: { medianViewers: 10, chatMessages: 2, uniqueChatters: 1 }, after: { medianViewers: 12, chatMessages: 3, uniqueChatters: 2 } }],
            rankings: { averageViewers: ['PEAK'], viewerRetention: ['PEAK'], chatRate: ['PEAK'], uniqueChatRate: ['PEAK'], donationRate: ['PEAK'] },
            chat: {
                humanMessages: 2,
                botMessages: 1,
                uniqueChatters: 1,
                emoteCount: 1,
                botEmoteCount: 2,
                topEmotes: [{ value: 'PogChamp <unsafe>', total: 3, human: 1, bot: 2 }],
                topChatters: [],
                topWords: [{ value: 'unused', count: 2 }],
                topBigrams: [{ value: 'unused phrase', count: 2 }]
            },
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

    test('renders quantitative axes with local and elapsed time labels', () => {
        const html = renderHtml(report, 'America/Los_Angeles');

        expect(html).toContain('class="viewer-axis"');
        expect(html).toContain('class="time-axis"');
        expect(html).toContain('Viewers');
        expect(html).toContain('03:00');
        expect(html).toContain('+0h');
        expect(html).toContain('+1h');
    });

    test('renders timestamp-aligned game transitions and donation markers', () => {
        const hostileReport = structuredClone(report);
        hostileReport.metrics.donations.items[0].displayName = 'Alice <admin>';
        hostileReport.metrics.donations.items[0].message = '</title><script>alert(1)</script>';
        const html = renderHtml(hostileReport, 'America/Los_Angeles');

        expect(html.match(/class="game-segment"/g)).toHaveLength(2);
        expect(html.match(/class="game-transition"/g)).toHaveLength(1);
        expect(html.match(/class="donation-marker"/g)).toHaveLength(1);
        expect(html).toContain('Viewer average');
        expect(html).toContain('Game segment');
        expect(html).toContain('Game transition');
        expect(html).toContain('Donation');
        expect(html).toContain('PEAK → Minecraft &amp; Friends');
        expect(html).toContain('Alice &lt;admin&gt;');
        expect(html).toContain('&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).not.toContain('</title><script>');
    });

    test('omits optional annotation markers when games and donations are absent', () => {
        const sparseReport = structuredClone(report);
        sparseReport.sessions.gameSegments = [];
        sparseReport.metrics.donations.items = [];
        const html = renderHtml(sparseReport, 'America/Los_Angeles');

        expect(html).toContain('class="viewer-axis"');
        expect(html).not.toContain('class="game-transition"');
        expect(html).not.toContain('class="donation-marker"');
    });

    test('renders a single zero-viewer sample as a finite visible point', () => {
        const singleSampleReport = structuredClone(report);
        singleSampleReport.metrics.timeline = [
            { start: '2025-11-01T10:15:00.000Z', end: '2025-11-01T10:30:00.000Z', averageViewers: 0 }
        ];
        const html = renderHtml(singleSampleReport, 'America/Los_Angeles');
        const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));

        expect(svg.match(/class="viewer-point"/g)).toHaveLength(1);
        expect(svg).not.toContain('>0.2</text>');
        expect(svg).not.toContain('NaN');
        expect(svg).not.toContain('Infinity');
    });

    test('shows human and bot emotes without low-signal lexical or coverage columns', () => {
        const html = renderHtml(report, 'America/Los_Angeles');

        expect(html).toContain('Human emotes');
        expect(html).toContain('Bot emotes');
        expect(html).toContain('PogChamp &lt;unsafe&gt;');
        expect(html).toContain('<td data-value="60">60</td>');
        expect(html).toContain('<td data-value="10">10</td>');
        expect(html).not.toContain('<h3>Top words</h3>');
        expect(html).not.toContain('<h3>Top phrases</h3>');
        expect(html).not.toContain('<th>Coverage samples</th>');
    });
});
