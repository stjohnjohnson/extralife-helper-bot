const { calculateMetrics } = require('../../src/analysis/metrics.js');

const start = '2025-11-01T10:00:00.000Z';
const at = minutes => new Date(new Date(start).getTime() + minutes * 60_000).toISOString();
const event = (type, minutes, data) => ({ type, timestamp: at(minutes), line: minutes + 1, confidence: 'exact', data });

describe('event metrics', () => {
    test('calculates overview, game, chat, donation, and timeline metrics', () => {
        const events = [
            event('viewer_sample', 0, { viewerCount: 10, game: 'PEAK' }),
            event('viewer_sample', 10, { viewerCount: 20, game: 'PEAK' }),
            event('viewer_sample', 20, { viewerCount: 30, game: 'PEAK' }),
            event('viewer_sample', 30, { viewerCount: 20, game: 'Minecraft' }),
            event('viewer_sample', 40, { viewerCount: 10, game: 'Minecraft' }),
            event('viewer_sample', 50, { viewerCount: 10, game: 'Minecraft' }),
            event('chat_message', 5, { username: 'alice', text: 'Love this game! https://example.com' }),
            event('chat_message', 15, { username: 'helperbot', text: 'Automated notice' }),
            event('chat_message', 25, { username: 'bob', text: '!donate :heart: love PEAK' }),
            event('chat_message', 35, { username: 'alice', text: 'Building blocks' }),
            event('donation', 12, { displayName: 'Donor', amount: 25, message: 'Go!', classification: 'live' }),
            event('donation', 45, { displayName: 'Old', amount: 100, message: '', classification: 'startup' })
        ];
        const sessions = {
            selected: { start, end: at(60), durationMs: 3_600_000, viewerSampleCount: 6 },
            excluded: [], gaps: [],
            gameSegments: [
                { game: 'PEAK', start, end: at(30), durationMs: 1_800_000 },
                { game: 'Minecraft', start: at(30), end: at(60), durationMs: 1_800_000 }
            ]
        };

        const result = calculateMetrics(events, sessions, { botUsers: ['helperbot'] });

        expect(result.schemaVersion).toBe(1);
        expect(result.overview).toMatchObject({
            durationMinutes: 60,
            viewerSamples: 6,
            averageViewers: 16.67,
            peakViewers: 30,
            humanChatMessages: 3,
            uniqueChatters: 2,
            donationCount: 1,
            donationTotal: 25
        });
        expect(result.games.map(game => ({
            game: game.game,
            durationMinutes: game.durationMinutes,
            averageViewers: game.viewer.average,
            chatMessages: game.chat.messages,
            donationTotal: game.donations.total,
            eligible: game.eligibleForRanking
        }))).toEqual([
            { game: 'Minecraft', durationMinutes: 30, averageViewers: 13.33, chatMessages: 1, donationTotal: 0, eligible: true },
            { game: 'PEAK', durationMinutes: 30, averageViewers: 20, chatMessages: 2, donationTotal: 25, eligible: true }
        ]);
        expect(result.chat).toMatchObject({
            botMessages: 1,
            commandCount: 1,
            linkCount: 1,
            emoteCount: 1,
            crossGameChatters: 1
        });
        expect(result.chat.topWords.slice(0, 2)).toEqual([
            { value: 'love', count: 2 },
            { value: 'blocks', count: 1 }
        ]);
        expect(result.donations).toMatchObject({ count: 1, total: 25, startupCount: 1, messageCount: 1 });
        expect(result.timeline).toHaveLength(4);
        expect(result.timeline.reduce((sum, bin) => sum + bin.viewerSamples, 0)).toBe(6);
        expect(result.games.reduce((sum, game) => sum + game.viewer.samples, 0)).toBe(6);
        expect(result.rankings.averageViewers[0]).toBe('PEAK');
    });

    test('attributes a boundary donation to only the game beginning at that timestamp', () => {
        const sessions = {
            selected: { start, end: at(60), durationMs: 3_600_000, viewerSampleCount: 2 },
            excluded: [], gaps: [],
            gameSegments: [
                { game: 'First', start, end: at(30), durationMs: 1_800_000 },
                { game: 'Second', start: at(30), end: at(60), durationMs: 1_800_000 }
            ]
        };
        const events = [
            event('viewer_sample', 0, { viewerCount: 5, game: 'First' }),
            event('viewer_sample', 30, { viewerCount: 5, game: 'Second' }),
            event('donation', 30, { displayName: 'Donor', amount: 10, message: '', classification: 'live' })
        ];

        const result = calculateMetrics(events, sessions);

        expect(result.games.map(game => [game.game, game.donations.total])).toEqual([
            ['First', 0], ['Second', 10]
        ]);
    });

    test('infers recognizable announcement messages as bot traffic', () => {
        const sessions = {
            selected: { start, end: at(30), durationMs: 1_800_000, viewerSampleCount: 1 },
            excluded: [], gaps: [],
            gameSegments: [{ game: 'PEAK', start, end: at(30), durationMs: 1_800_000 }]
        };
        const events = [
            event('viewer_sample', 0, { viewerCount: 5, game: 'PEAK' }),
            event('chat_message', 5, { username: 'unknownbot', text: 'ExtraLife ExtraLife Donor just donated $5.00! ExtraLife ExtraLife' })
        ];

        const result = calculateMetrics(events, sessions);

        expect(result.chat).toMatchObject({ humanMessages: 0, botMessages: 1 });
    });

    test('excludes short games and outage transitions from rankings', () => {
        const sessions = {
            selected: { start, end: at(45), durationMs: 2_700_000, viewerSampleCount: 4 },
            excluded: [],
            gaps: [{ start: at(20), end: at(40), durationMs: 1_200_000 }],
            gameSegments: [
                { game: 'Long', start, end: at(30), durationMs: 1_800_000 },
                { game: 'Short', start: at(30), end: at(45), durationMs: 900_000 }
            ]
        };
        const events = [0, 10, 40, 44].map((minutes, index) =>
            event('viewer_sample', minutes, { viewerCount: 5 + index, game: minutes < 30 ? 'Long' : 'Short' })
        );

        const result = calculateMetrics(events, sessions);

        expect(result.games.find(game => game.game === 'Short').eligibleForRanking).toBe(false);
        expect(result.rankings.averageViewers).toEqual(['Long']);
        expect(result.transitions[0]).toMatchObject({ included: false, reason: 'coverage gap' });
    });
});
