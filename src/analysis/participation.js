function stats(values) {
    if (!values.length) return { average: null, median: null, peak: null, start: null, end: null };
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return { average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100,
        median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
        peak: Math.max(...values), start: values[0], end: values.at(-1) };
}

function coverage(samples, windows) {
    const ordered = [...samples].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let coveredMs = 0;
    let durationMs = 0;
    const gaps = [];
    const cadences = new Set();
    for (const window of windows) {
        const start = new Date(window.start).getTime();
        const end = new Date(window.end).getTime();
        durationMs += end - start;
        let cursor = start;
        let lastTime = null;
        let lastCadence = 60;
        for (const sample of ordered) {
            const time = new Date(sample.timestamp).getTime();
            const stop = Math.min(end, time + sample.data.intervalSeconds * 1000);
            const begin = Math.max(start, time, cursor);
            if (stop <= begin) continue;
            cadences.add(sample.data.intervalSeconds);
            if (begin > cursor && (lastTime === null ? begin - cursor > sample.data.intervalSeconds * 2000 : time - lastTime > lastCadence * 2000)) gaps.push({ start: new Date(cursor).toISOString(), end: new Date(begin).toISOString(), durationMs: begin - cursor });
            coveredMs += stop - begin;
            cursor = stop;
            lastTime = time;
            lastCadence = sample.data.intervalSeconds;
        }
        const cadence = lastCadence;
        if (end > cursor && end - (lastTime ?? cursor) > cadence * 2000) gaps.push({ start: new Date(cursor).toISOString(), end: new Date(end).toISOString(), durationMs: end - cursor });
    }
    const cadenceSeconds = [...cadences].sort((a, b) => a - b);
    const interval = cadenceSeconds[0] || 60;
    return { coveredMs, durationMs, percent: durationMs ? Math.round(coveredMs / durationMs * 10000) / 100 : 0,
        cadenceSeconds, missingObservations: Math.ceil((durationMs - coveredMs) / (interval * 1000)), gaps };
}

function summarizeVoice(events, windows, includeEnd = true) {
    const belongs = event => windows.some(window => event.timestamp >= window.start &&
        (event.timestamp < window.end || (includeEnd === true || includeEnd === window.end) && event.timestamp === window.end));
    const observations = events.filter(event => event.type === 'voice_sample' && belongs(event))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const periodic = observations.filter(event => event.data.trigger === 'periodic');
    const allPeriodic = events.filter(event => event.type === 'voice_sample' && event.data.trigger === 'periodic');
    return { periodicSamples: periodic.length,
        humans: stats(periodic.map(event => event.data.humanCount)),
        companions: stats(periodic.map(event => event.data.companionCount)),
        bots: stats(periodic.map(event => event.data.botCount)),
        coverage: coverage(allPeriodic, windows),
        serviceFailures: events.filter(event => event.type === 'service_error' && event.data.service === 'discord_voice' && belongs(event)).length,
        observations: observations.map(event => ({ timestamp: event.timestamp, ...event.data })) };
}

function addParticipation(metrics, events, sessions) {
    const modern = events.some(event => event.type === 'voice_sample' || event.type === 'viewer_sample' && typeof event.data.online === 'boolean' || event.type === 'service_error' && ['discord_voice', 'twitch_viewers'].includes(event.data.service));
    if (!modern) return metrics;
    if (!metrics.viewer.samples) {
        for (const key of ['average', 'median', 'peak', 'minimum', 'start', 'end', 'retentionPercent', 'netChange', 'trendPerHour', 'volatility']) metrics.viewer[key] = null;
        metrics.overview.averageViewers = null;
        metrics.overview.peakViewers = null;
    }
    metrics.voice = summarizeVoice(events, [metrics.eventWindow]);
    metrics.viewer.coverage = coverage(events.filter(event => event.type === 'viewer_sample' && event.data.intervalSeconds), [metrics.eventWindow]);
    metrics.viewer.serviceFailures = events.filter(event => event.type === 'service_error' && event.data.service === 'twitch_viewers' && event.timestamp >= metrics.eventWindow.start && event.timestamp <= metrics.eventWindow.end).length;
    for (const game of metrics.games) {
        const windows = sessions.gameSegments.filter(segment => segment.game === game.game);
        game.voice = summarizeVoice(events, windows, sessions.selected.end);
        if (!game.viewer.samples) {
            for (const key of ['average', 'median', 'peak', 'minimum', 'start', 'end', 'retentionPercent', 'netChange', 'trendPerHour', 'volatility']) game.viewer[key] = null;
        }
    }
    const viewerGames = new Set(metrics.games.filter(game => game.viewer.samples > 0).map(game => game.game));
    metrics.rankings.averageViewers = metrics.rankings.averageViewers.filter(game => viewerGames.has(game));
    metrics.rankings.viewerRetention = metrics.rankings.viewerRetention.filter(game => viewerGames.has(game));
    for (let index = 0; index < metrics.timeline.length; index++) {
        const bin = metrics.timeline[index];
        bin.voice = summarizeVoice(events, [bin], index === metrics.timeline.length - 1);
        if (!bin.viewerSamples) bin.averageViewers = null;
    }
    return metrics;
}
module.exports = { addParticipation };
