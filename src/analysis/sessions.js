const STITCH_LIMIT_MS = 10 * 60 * 1000;
const PRESENCE_FLAP_MS = 2 * 60 * 1000;

function iso(value) {
    return new Date(value).toISOString();
}

function median(values) {
    if (!values.length) return 5 * 60 * 1000;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sessionFromSamples(samples) {
    const ordered = [...samples].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    const differences = ordered.slice(1).map((sample, index) =>
        new Date(sample.timestamp) - new Date(ordered[index].timestamp)
    );
    const cadenceMs = Math.min(median(differences), STITCH_LIMIT_MS);
    const first = ordered[0];
    const last = ordered.at(-1);
    return {
        source: 'detected',
        channel: first.data.channel,
        title: first.data.title,
        start: iso(first.data.startedAt),
        end: iso(new Date(last.timestamp).getTime() + cadenceMs),
        lastSample: iso(last.timestamp),
        viewerSampleCount: ordered.length,
        stitchedSessionCount: 1,
        samples: ordered,
        cadenceMs
    };
}

function detectRawSessions(viewers) {
    const groups = new Map();
    for (const viewer of viewers) {
        const key = [viewer.data.channel, viewer.data.title, viewer.data.startedAt].join('\u0000');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(viewer);
    }
    return [...groups.values()].map(sessionFromSamples).sort((left, right) => left.start.localeCompare(right.start));
}

function stitchSessions(rawSessions) {
    const stitched = [];
    for (const session of rawSessions) {
        const previous = stitched.at(-1);
        const gap = previous ? new Date(session.start) - new Date(previous.lastSample) : Infinity;
        if (previous && previous.channel === session.channel && previous.title === session.title && gap <= STITCH_LIMIT_MS) {
            previous.samples.push(...session.samples);
            previous.samples.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
            previous.lastSample = session.lastSample;
            previous.end = session.end;
            previous.viewerSampleCount += session.viewerSampleCount;
            previous.stitchedSessionCount += 1;
            const differences = previous.samples.slice(1).map((sample, index) =>
                new Date(sample.timestamp) - new Date(previous.samples[index].timestamp)
            );
            previous.cadenceMs = Math.min(median(differences), STITCH_LIMIT_MS);
        } else {
            stitched.push({ ...session, samples: [...session.samples] });
        }
    }
    return stitched;
}

function applyTerminalStop(session, gameChanges) {
    const lastSample = new Date(session.lastSample).getTime();
    const stop = gameChanges
        .filter(event => event.data.newGame === 'none' || !event.data.newGame)
        .find(event => {
            const time = new Date(event.timestamp).getTime();
            return time >= lastSample && time - lastSample <= STITCH_LIMIT_MS;
        });
    if (stop) session.end = iso(stop.timestamp);
    return session;
}

function findGaps(samples, cadenceMs) {
    const gaps = [];
    for (let index = 1; index < samples.length; index += 1) {
        const start = new Date(samples[index - 1].timestamp);
        const end = new Date(samples[index].timestamp);
        if (end - start > cadenceMs * 2) {
            gaps.push({ start: start.toISOString(), end: end.toISOString(), durationMs: end - start });
        }
    }
    return gaps;
}

function collapsePresenceFlaps(changes) {
    const collapsed = [];
    for (let index = 0; index < changes.length; index += 1) {
        const current = changes[index];
        const next = changes[index + 1];
        const isStop = current.data.newGame === 'none' || !current.data.newGame;
        if (isStop && next && next.data.newGame && next.data.newGame !== 'none' &&
            new Date(next.timestamp) - new Date(current.timestamp) <= PRESENCE_FLAP_MS) {
            collapsed.push(next);
            index += 1;
        } else {
            collapsed.push(current);
        }
    }
    return collapsed;
}

function buildGameSegments(events, selected) {
    const viewers = events
        .filter(event => event.type === 'viewer_sample' && event.timestamp >= selected.start && event.timestamp <= selected.end)
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    const firstGame = viewers[0]?.data.game || 'Unknown';
    const changes = collapsePresenceFlaps(events
        .filter(event => event.type === 'game_change' && event.timestamp > selected.start && event.timestamp <= selected.end)
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp)));

    const transitions = [...changes];
    let sampledGame = firstGame;
    for (const sample of viewers) {
        if (sample.data.game && sample.data.game !== sampledGame) {
            if (!transitions.some(change => change.timestamp === sample.timestamp && change.data.newGame === sample.data.game)) {
                transitions.push({ timestamp: sample.timestamp, data: { newGame: sample.data.game } });
            }
            sampledGame = sample.data.game;
        }
    }
    transitions.sort((left, right) => left.timestamp.localeCompare(right.timestamp));

    const segments = [];
    let currentGame = firstGame;
    let currentStart = selected.start;
    for (const transition of transitions) {
        const nextGame = transition.data.newGame && transition.data.newGame !== 'none'
            ? transition.data.newGame
            : 'Just Chatting';
        if (transition.timestamp === selected.end && nextGame === 'Just Chatting') continue;
        if (nextGame === currentGame) continue;
        segments.push({
            game: currentGame,
            start: currentStart,
            end: iso(transition.timestamp),
            durationMs: new Date(transition.timestamp) - new Date(currentStart)
        });
        currentGame = nextGame;
        currentStart = iso(transition.timestamp);
    }
    segments.push({
        game: currentGame,
        start: currentStart,
        end: selected.end,
        durationMs: new Date(selected.end) - new Date(currentStart)
    });
    return segments.filter(segment => segment.durationMs > 0);
}

function buildSessions(events, options = {}) {
    if (options.start && options.end) {
        const selected = {
            source: 'manual',
            start: iso(options.start),
            end: iso(options.end),
            viewerSampleCount: events.filter(event => event.type === 'viewer_sample' &&
                event.timestamp >= options.start && event.timestamp <= options.end).length,
            stitchedSessionCount: 0,
            samples: [],
            cadenceMs: 5 * 60 * 1000
        };
        return { selected, excluded: [], gaps: [], gameSegments: buildGameSegments(events, selected) };
    }

    const viewers = events.filter(event => event.type === 'viewer_sample' && event.timestamp);
    if (!viewers.length) throw new Error('No live stream session detected; provide --start and --end');

    const gameChanges = events.filter(event => event.type === 'game_change' && event.timestamp);
    const sessions = stitchSessions(detectRawSessions(viewers)).map(session => applyTerminalStop(session, gameChanges));
    sessions.sort((left, right) => {
        const durationDifference = (new Date(right.end) - new Date(right.start)) -
            (new Date(left.end) - new Date(left.start));
        return durationDifference || left.start.localeCompare(right.start);
    });
    const selected = sessions[0];
    selected.durationMs = new Date(selected.end) - new Date(selected.start);
    const excluded = sessions.slice(1).map(session => ({
        source: session.source,
        channel: session.channel,
        title: session.title,
        start: session.start,
        end: session.end,
        viewerSampleCount: session.viewerSampleCount,
        stitchedSessionCount: session.stitchedSessionCount
    }));

    return {
        selected,
        excluded,
        gaps: findGaps(selected.samples, selected.cadenceMs),
        gameSegments: buildGameSegments(events, selected)
    };
}

module.exports = { buildSessions };
