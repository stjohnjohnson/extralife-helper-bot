const { parseConfiguration } = require('../src/config');
const { eventMetadata } = require('../src/analysis/eventMetadata');
const { buildSessions } = require('../src/analysis/sessions');
const { calculateMetrics } = require('../src/analysis/metrics');
const { parseLog } = require('../src/analysis/parser');
const t = seconds => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();
const voice = (seconds, count, trigger = 'periodic') => ({ type: 'voice_sample', timestamp: t(seconds), data: { guildId: 'g', channelId: 'c', streamerPresent: true, humanCount: count + 1, companionCount: count, botCount: 1, intervalSeconds: 60, trigger } });
test('sampling configuration defaults and rejects invalid intervals', () => {
    expect(parseConfiguration().twitch.viewerSampleIntervalSeconds).toBe(60);
    expect(parseConfiguration().discord.voiceSampleIntervalSeconds).toBe(60);
    for (const value of ['0', '14', '3601', '1.5', 'abc']) {
        process.env.TWITCH_VIEWER_SAMPLE_INTERVAL_SECONDS = value;
        expect(parseConfiguration().errors.join(' ')).toContain('TWITCH_VIEWER_SAMPLE_INTERVAL_SECONDS');
    }
    delete process.env.TWITCH_VIEWER_SAMPLE_INTERVAL_SECONDS;
});
test('voice metadata and parser support valid counts and reject invalid samples', () => {
    const data = eventMetadata('voice_sample', voice(0, 2).data);
    const parsed = parseLog(`${t(0)} [discord] INFO: Voice ${JSON.stringify(data)}`);
    expect(parsed.events[0].data.companionCount).toBe(2);
    const bad = parseLog(`${t(0)} [discord] INFO: Voice ${JSON.stringify({ ...data, companionCount: -1 })}`);
    expect(bad.events).toHaveLength(0);
    expect(bad.diagnostics.malformedLines).toHaveLength(1);
});
test('voice summaries exclude changes and preserve gaps', () => {
    const events = [voice(0, 2), voice(10, 99, 'change'), voice(60, 4), voice(240, 0)];
    const sessions = buildSessions(events, { start: t(0), end: t(300) });
    const metrics = calculateMetrics(events, sessions);
    expect(metrics.voice.companions.average).toBe(2);
    expect(metrics.voice.companions.peak).toBe(4);
    expect(metrics.voice.periodicSamples).toBe(3);
    expect(metrics.voice.coverage.coveredMs).toBe(180000);
    expect(metrics.voice.coverage.missingObservations).toBe(2);
    expect(metrics.voice.coverage.gaps).toHaveLength(1);
    expect(metrics.voice.observations).toHaveLength(4);
});
test('offline samples end detected sessions and never create sessions', () => {
    const online = { type: 'viewer_sample', timestamp: t(0), data: { online: true, intervalSeconds: 60, channel: 'x', title: 's', startedAt: t(0), game: 'G', viewerCount: 2 } };
    const offline = { type: 'viewer_sample', timestamp: t(30), data: { online: false, intervalSeconds: 60, channel: 'x', viewerCount: 0 } };
    expect(buildSessions([online, offline]).selected.end).toBe(t(30));
    expect(() => buildSessions([offline])).toThrow('No live stream');
});
test('voice reports escape channel identifiers and show definitions and coverage', () => {
    const { renderHtml } = require('../src/analysis/report');
    const events = [voice(0, 2), voice(60, 4)];
    events[0].data.channelId = '<script>alert(1)</script>';
    const sessions = buildSessions(events, { start: t(0), end: t(120) });
    const metrics = calculateMetrics(events, sessions);
    const report = { metrics, sessions, source: { name: 'test', lineCount: 2 }, diagnostics: { unknownLines: [], malformedLines: [], ambiguousTimestamps: [], duplicateEvents: [] } };
    const html = renderHtml(report, 'UTC');
    expect(html).toContain('Voice companions');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('Periodic samples');
});
test('legacy metrics and HTML are byte-identical to the original analyzer', () => {
    const fs = require('fs');
    const path = require('path');
    const expectedJson = fs.readFileSync(path.join(__dirname, 'fixtures/participation/legacy.json'), 'utf8');
    const expected = JSON.parse(expectedJson);
    const events = [{ type: 'viewer_sample', timestamp: t(0), data: { channel: 'x', title: 's', startedAt: t(0), game: 'G', viewerCount: 2 } }];
    const sessions = buildSessions(events);
    expect(sessions).toEqual(expected.sessions);
    const metrics = calculateMetrics(events, sessions);
    expect(metrics).toEqual(expected.metrics);
    const report = { metrics, sessions, source: { name: 'legacy', lineCount: 1 }, diagnostics: { unknownLines: [], malformedLines: [], ambiguousTimestamps: [], duplicateEvents: [] } };
    const { renderHtml, stableStringify } = require('../src/analysis/report');
    expect(renderHtml(report, 'UTC')).toBe(fs.readFileSync(path.join(__dirname, 'fixtures/participation/legacy.html'), 'utf8'));
    expect(stableStringify(report)).toBe(expectedJson);
});
test('an explicit offline break prevents stitching otherwise compatible streams', () => {
    const sample = (seconds, started) => ({ type: 'viewer_sample', timestamp: t(seconds), data: { channel: 'x', title: 'same', online: true, intervalSeconds: 60, viewerCount: 3, startedAt: t(started) } });
    const events = [sample(0, 0), sample(60, 0), { type: 'viewer_sample', timestamp: t(90), data: { channel: 'x', online: false, viewerCount: 0 } }, sample(120, 120), sample(180, 120)];
    const sessions = buildSessions(events);
    expect(sessions.excluded).toHaveLength(1);
    expect(sessions.selected.start).toBe(t(120));
});
test('a game boundary belongs to the later game and event-driven peak stays excluded', () => {
    const events = [voice(0, 1), voice(60, 5), voice(65, 80, 'change'), { type: 'game_change', timestamp: t(60), data: { newGame: 'Second' } }];
    const sessions = buildSessions(events, { start: t(0), end: t(120) });
    const metrics = calculateMetrics(events, sessions);
    expect(metrics.games.find(game => game.game === 'Unknown').voice.companions.peak).toBe(1);
    expect(metrics.games.find(game => game.game === 'Second').voice.companions.peak).toBe(5);
});
test('a sampling gap greater than twice cadence is flagged and missing viewer bins are not zero', () => {
    const events = [voice(0, 1), voice(150, 2)];
    const sessions = buildSessions(events, { start: t(0), end: t(1800) });
    const metrics = calculateMetrics(events, sessions);
    expect(metrics.voice.coverage.gaps[0]).toMatchObject({ start: t(60), end: t(150) });
    expect(metrics.overview.averageViewers).toBeNull();
    const { renderHtml } = require('../src/analysis/report');
    const report = { metrics, sessions, source: { name: 'gap', lineCount: 2 }, diagnostics: { unknownLines: [], malformedLines: [], ambiguousTimestamps: [], duplicateEvents: [] } };
    expect(renderHtml(report, 'UTC')).not.toContain('null average viewers');
});
test('same-time duplicate voice observations retain periodic eligibility', () => {
    const first = { eventVersion: 1, eventType: 'voice_sample', ...voice(0, 2, 'change').data };
    const second = { ...first, trigger: 'periodic' };
    const parsed = parseLog([first, second].map(data => `${t(0)} [discord] INFO: Voice ${JSON.stringify(data)}`).join('\n'));
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].data.trigger).toBe('periodic');
});
test('offline breaks split samples even when stream identifiers are unchanged', () => {
    const sample = seconds => ({ type: 'viewer_sample', timestamp: t(seconds), data: { channel: 'x', title: 'same', online: true, intervalSeconds: 60, viewerCount: 3, startedAt: t(0) } });
    const events = [sample(0), { type: 'viewer_sample', timestamp: t(30), data: { channel: 'x', online: false, viewerCount: 0 } }, sample(60)];
    const sessions = buildSessions(events);
    expect(sessions.excluded).toHaveLength(1);
    expect(sessions.selected.start).toBe(t(60));
});
test('later unrelated cadence cannot suppress selected-window tail gaps', () => {
    const later = voice(10000, 3); later.data.intervalSeconds = 3600;
    const sessions = buildSessions([voice(0, 1), later], { start: t(0), end: t(180) });
    const result = calculateMetrics([voice(0, 1), later], sessions).voice.coverage;
    expect(result.gaps).toHaveLength(1);
    expect(result.cadenceSeconds).toEqual([60]);
});
test('missing viewer games have unavailable derived metrics and no viewer rankings', () => {
    const events = [voice(0, 1)];
    const sessions = buildSessions(events, { start: t(0), end: t(3600) });
    const metrics = calculateMetrics(events, sessions);
    expect(metrics.games[0].viewer.retentionPercent).toBeNull();
    expect(metrics.rankings.averageViewers).toEqual([]);
    expect(metrics.rankings.viewerRetention).toEqual([]);
});
