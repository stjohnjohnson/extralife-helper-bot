const stopwords = require('./stopwords.js');

const BIN_MS = 15 * 60 * 1000;
const TRANSITION_MS = 30 * 60 * 1000;
const MIN_RANKING_MS = 30 * 60 * 1000;

function round(value, digits = 2) {
    if (!Number.isFinite(value)) return 0;
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

function average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values) {
    if (!values.length) return 0;
    const mean = average(values);
    return Math.sqrt(average(values.map(value => (value - mean) ** 2)));
}

function trendPerHour(samples) {
    if (samples.length < 2) return 0;
    const origin = new Date(samples[0].timestamp).getTime();
    const points = samples.map(sample => ({
        x: (new Date(sample.timestamp).getTime() - origin) / 3_600_000,
        y: sample.data.viewerCount
    }));
    const meanX = average(points.map(point => point.x));
    const meanY = average(points.map(point => point.y));
    const numerator = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0);
    const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
    return denominator ? numerator / denominator : 0;
}

function eventInRange(event, start, end, includeEnd = false) {
    if (!event.timestamp) return false;
    return event.timestamp >= start && (includeEnd ? event.timestamp <= end : event.timestamp < end);
}

function segmentFor(timestamp, segments) {
    return segments.find((segment, index) =>
        timestamp >= segment.start && (timestamp < segment.end || (index === segments.length - 1 && timestamp <= segment.end))
    );
}

function countValues(values) {
    const counts = new Map();
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    return [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function isBotMessage(event, botUsers) {
    const username = event.data.username?.toLowerCase();
    const text = event.data.text || '';
    return event.data.self || botUsers.has(username) || text.includes('ExtraLife ExtraLife') ||
        /^Now playing .+!$/u.test(text);
}

function lexicalTokens(text) {
    return text
        .normalize('NFKC')
        .toLowerCase()
        .replace(/https?:\/\/\S+/gu, ' ')
        .replace(/(^|\s)!\S+/gu, ' ')
        .replace(/:[\p{L}\p{N}_-]+:/gu, ' ')
        .replace(/[^\p{L}\p{N}'\s]+/gu, ' ')
        .split(/\s+/u)
        .filter(token => token.length > 1 && !stopwords.has(token));
}

function viewerStats(samples) {
    const values = samples.map(sample => sample.data.viewerCount);
    const rollingMedian = samples.map((sample, index) => ({
        timestamp: sample.timestamp,
        value: round(median(values.slice(Math.max(0, index - 1), index + 2)))
    }));
    return {
        samples: values.length,
        start: values[0] || 0,
        end: values.at(-1) || 0,
        average: round(average(values)),
        median: round(median(values)),
        peak: values.length ? Math.max(...values) : 0,
        minimum: values.length ? Math.min(...values) : 0,
        netChange: values.length ? values.at(-1) - values[0] : 0,
        retentionPercent: values[0] ? round(values.at(-1) / values[0] * 100) : 0,
        trendPerHour: round(trendPerHour(samples)),
        volatility: round(standardDeviation(values)),
        rollingMedian
    };
}

function buildTimeline(events, selected, botUsers) {
    const startMs = new Date(selected.start).getTime();
    const endMs = new Date(selected.end).getTime();
    const bins = [];
    for (let binStart = startMs; binStart < endMs; binStart += BIN_MS) {
        const binEnd = Math.min(binStart + BIN_MS, endMs);
        const start = new Date(binStart).toISOString();
        const end = new Date(binEnd).toISOString();
        const viewers = events.filter(event => event.type === 'viewer_sample' &&
            eventInRange(event, start, end, binEnd === endMs));
        const chats = events.filter(event => event.type === 'chat_message' && eventInRange(event, start, end) &&
            !isBotMessage(event, botUsers));
        const donations = events.filter(event => event.type === 'donation' && eventInRange(event, start, end) &&
            event.data.classification === 'live');
        bins.push({
            start,
            end,
            averageViewers: round(average(viewers.map(event => event.data.viewerCount))),
            viewerSamples: viewers.length,
            chatMessages: chats.length,
            uniqueChatters: new Set(chats.map(event => event.data.username.toLowerCase())).size,
            donationCount: donations.length,
            donationTotal: round(donations.reduce((sum, event) => sum + event.data.amount, 0))
        });
    }
    return bins;
}

function buildGames(events, segments, botUsers) {
    const grouped = new Map();
    for (const segment of segments) {
        if (!grouped.has(segment.game)) grouped.set(segment.game, []);
        grouped.get(segment.game).push(segment);
    }

    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([game, gameSegments]) => {
        const durationMs = gameSegments.reduce((sum, segment) => sum + segment.durationMs, 0);
        const belongs = event => segmentFor(event.timestamp, segments)?.game === game;
        const viewers = events.filter(event => event.type === 'viewer_sample' && belongs(event));
        const chats = events.filter(event => event.type === 'chat_message' && belongs(event) &&
            !isBotMessage(event, botUsers));
        const donations = events.filter(event => event.type === 'donation' && belongs(event) &&
            event.data.classification === 'live');
        const hours = durationMs / 3_600_000;
        return {
            game,
            segments: gameSegments.length,
            durationMinutes: round(durationMs / 60_000),
            coverage: viewers.length,
            viewer: viewerStats(viewers),
            chat: {
                messages: chats.length,
                messagesPerHour: round(chats.length / hours),
                uniqueChatters: new Set(chats.map(event => event.data.username.toLowerCase())).size,
                uniqueChattersPerHour: round(new Set(chats.map(event => event.data.username.toLowerCase())).size / hours)
            },
            donations: {
                count: donations.length,
                countPerHour: round(donations.length / hours),
                total: round(donations.reduce((sum, event) => sum + event.data.amount, 0)),
                dollarsPerHour: round(donations.reduce((sum, event) => sum + event.data.amount, 0) / hours)
            },
            eligibleForRanking: durationMs >= MIN_RANKING_MS
        };
    });
}

function buildChat(events, segments, botUsers, timeline) {
    const all = events.filter(event => event.type === 'chat_message');
    const humans = all.filter(event => !isBotMessage(event, botUsers));
    const names = humans.map(event => event.data.username.toLowerCase());
    const counts = countValues(names);
    const words = humans.flatMap(event => lexicalTokens(event.data.text));
    const bigrams = humans.flatMap(event => {
        const tokens = lexicalTokens(event.data.text);
        return tokens.slice(1).map((token, index) => `${tokens[index]} ${token}`);
    });
    const byUserGames = new Map();
    for (const message of humans) {
        const game = segmentFor(message.timestamp, segments)?.game;
        const name = message.data.username.toLowerCase();
        if (!byUserGames.has(name)) byUserGames.set(name, new Set());
        if (game) byUserGames.get(name).add(game);
    }
    const gaps = humans.slice(1).map((message, index) => new Date(message.timestamp) - new Date(humans[index].timestamp));
    const topCount = Math.max(1, Math.ceil(counts.length * 0.1));
    const topMessages = counts.slice(0, topCount).reduce((sum, item) => sum + item.count, 0);
    const nonzeroBins = timeline.filter(bin => bin.chatMessages > 0);

    return {
        humanMessages: humans.length,
        botMessages: all.length - humans.length,
        uniqueChatters: new Set(names).size,
        newChatters: new Set(names).size,
        returningChatters: counts.filter(item => item.count > 1).length,
        messagesPerChatter: round(humans.length / new Set(names).size),
        participationConcentrationPercent: round(topMessages / humans.length * 100),
        longestQuietGapMinutes: round((gaps.length ? Math.max(...gaps) : 0) / 60_000),
        burstIntensity: round(nonzeroBins.length ? Math.max(...nonzeroBins.map(bin => bin.chatMessages)) /
            average(nonzeroBins.map(bin => bin.chatMessages)) : 0),
        crossGameChatters: [...byUserGames.values()].filter(games => games.size > 1).length,
        commandCount: humans.filter(event => event.data.text.trim().startsWith('!')).length,
        linkCount: humans.reduce((sum, event) => sum + (event.data.text.match(/https?:\/\/\S+/gu) || []).length, 0),
        emoteCount: humans.reduce((sum, event) => sum + (event.data.text.match(/:[\p{L}\p{N}_-]+:/gu) || []).length, 0),
        topChatters: counts,
        topWords: countValues(words),
        topBigrams: countValues(bigrams)
    };
}

function buildDonations(events) {
    const all = events.filter(event => event.type === 'donation');
    const live = all.filter(event => event.data.classification === 'live');
    const values = live.map(event => event.data.amount);
    const names = live.map(event => event.data.displayName);
    return {
        count: live.length,
        total: round(values.reduce((sum, value) => sum + value, 0)),
        average: round(average(values)),
        median: round(median(values)),
        largest: values.length ? Math.max(...values) : 0,
        namedCount: names.filter(name => name !== 'Anonymous').length,
        anonymousCount: names.filter(name => name === 'Anonymous').length,
        repeatDonors: countValues(names).filter(item => item.count > 1),
        messageCount: live.filter(event => event.data.message).length,
        startupCount: all.filter(event => event.data.classification === 'startup').length,
        ambiguousCount: all.filter(event => event.data.classification === 'ambiguous').length,
        items: live.map(event => ({ timestamp: event.timestamp, ...event.data }))
    };
}

function buildTransitions(events, segments, gaps, botUsers) {
    return segments.slice(1).map((segment, index) => {
        const boundary = new Date(segment.start).getTime();
        const windowStart = new Date(boundary - TRANSITION_MS).toISOString();
        const windowEnd = new Date(boundary + TRANSITION_MS).toISOString();
        const overlapsGap = gaps.some(gap => gap.start < windowEnd && gap.end > windowStart);
        const summarize = (start, end) => {
            const viewers = events.filter(event => event.type === 'viewer_sample' && eventInRange(event, start, end));
            const chats = events.filter(event => event.type === 'chat_message' && eventInRange(event, start, end) &&
                !isBotMessage(event, botUsers));
            return {
                medianViewers: round(median(viewers.map(event => event.data.viewerCount))),
                viewerSamples: viewers.length,
                chatMessages: chats.length,
                uniqueChatters: new Set(chats.map(event => event.data.username.toLowerCase())).size
            };
        };
        const before = summarize(windowStart, segment.start);
        const after = summarize(segment.start, windowEnd);
        const included = !overlapsGap && before.viewerSamples >= 2 && after.viewerSamples >= 2;
        return {
            from: segments[index].game,
            to: segment.game,
            timestamp: segment.start,
            included,
            reason: included ? null : overlapsGap ? 'coverage gap' : 'insufficient samples',
            before,
            after
        };
    });
}

function buildRankings(games) {
    const eligible = games.filter(game => game.eligibleForRanking);
    const rank = selector => [...eligible]
        .sort((left, right) => selector(right) - selector(left) || left.game.localeCompare(right.game))
        .map(game => game.game);
    return {
        averageViewers: rank(game => game.viewer.average),
        viewerRetention: rank(game => game.viewer.retentionPercent),
        chatRate: rank(game => game.chat.messagesPerHour),
        uniqueChatRate: rank(game => game.chat.uniqueChattersPerHour),
        donationRate: rank(game => game.donations.dollarsPerHour)
    };
}

function calculateMetrics(events, sessions, options = {}) {
    const selected = sessions.selected;
    const inWindow = events.filter(event => event.timestamp && event.timestamp >= selected.start && event.timestamp <= selected.end);
    const botUsers = new Set((options.botUsers || []).map(name => name.toLowerCase()));
    const viewers = inWindow.filter(event => event.type === 'viewer_sample');
    const timeline = buildTimeline(inWindow, selected, botUsers);
    const games = buildGames(inWindow, sessions.gameSegments, botUsers);
    const chat = buildChat(inWindow, sessions.gameSegments, botUsers, timeline);
    const donations = buildDonations(inWindow);

    return {
        schemaVersion: 1,
        eventWindow: {
            start: selected.start,
            end: selected.end,
            durationMs: new Date(selected.end) - new Date(selected.start),
            source: selected.source
        },
        overview: {
            durationMinutes: round((new Date(selected.end) - new Date(selected.start)) / 60_000),
            viewerSamples: viewers.length,
            averageViewers: viewerStats(viewers).average,
            peakViewers: viewerStats(viewers).peak,
            humanChatMessages: chat.humanMessages,
            uniqueChatters: chat.uniqueChatters,
            donationCount: donations.count,
            donationTotal: donations.total
        },
        timeline,
        games,
        viewer: viewerStats(viewers),
        chat,
        donations,
        transitions: buildTransitions(inWindow, sessions.gameSegments, sessions.gaps, botUsers),
        rankings: buildRankings(games),
        diagnostics: {
            coverageGaps: sessions.gaps,
            excludedSessions: sessions.excluded
        }
    };
}

module.exports = { calculateMetrics };
