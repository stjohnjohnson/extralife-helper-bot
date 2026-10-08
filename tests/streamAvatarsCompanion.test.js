const { spawnSync } = require('node:child_process');
const { resolve, join } = require('node:path');
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { createInitialState, reduceObservation } = require('../src/broadcastSession/state');
const { validateServerMessage } = require('../src/streamAvatars/protocol');
test.each(['auth', 'movement', 'density', 'cleanup', 'expiry', 'generation', 'crowd', 'invalid', 'missing-image', 'reconnect', 'late-join', 'empty-crowd', 'negative-bounds', 'density-rotation', 'same-snapshot', 'new-session', 'stale-control', 'stop', 'close-open-race', 'socket-error', 'async-open', 'backoff', 'mailbox-burst', 'mailbox-overflow', 'malformed-json', 'invalid-snapshot', 'wrong-session', 'heartbeat-expiry', 'virtual-clock', 'no-custom-service', 'reload', 'invalid-settings', 'infinite-settings'])('shipped Lua companion: %s', scenario => {
    const result = spawnSync(process.env.LUA_BIN || 'lua', [resolve('tests/lua/companionHarness.lua'), resolve('integrations/stream-avatars/companion.lua'), scenario], { encoding: 'utf8', timeout: 5000 });
    if (result.error) throw new Error('Install Lua 5.2+ or set LUA_BIN: ' + result.error.code);
    expect({ status: result.status, stderr: result.stderr, stdout: result.stdout.trim() }).toEqual({ status: 0, stderr: '', stdout: 'OK ' + scenario });
});

function run(script, scenario, fixture) {
    return spawnSync(process.env.LUA_BIN || 'lua', [resolve('tests/lua/companionHarness.lua'), script, scenario, ...(fixture ? [fixture] : [])], { encoding: 'utf8', timeout: 5000 });
}
test('Lua consumes the actual Node protocol JSON, including nulls and UTF-8 fields', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sa-wire-'));
    try {
        const session = reduceObservation(createInitialState({ mode: 'rehearsal', channel: 'streamer_é' }), { status: 'online', observedAtMs: 1001, startedAtMs: 1000, streamId: 'fixture' }, { graceMs: 900000, cadenceMs: 60000, newSessionId: () => 'session' });
        const message = validateServerMessage({ version: 1, type: 'snapshot', mode: 'rehearsal', generation: 1, serverNowMs: 1000, session, elapsedMs: 1, strip: { x: 0, y: 0, width: 1000, height: 200 }, render: { maxHearts: 50, heartOffset: 16 }, rehearsal: { active: true, crowdIds: [] }, features: ['hearts', 'crowd', 'session', 'clock'] });
        const fixture = join(directory, 'snapshot.json'); writeFileSync(fixture, JSON.stringify(message));
        const result = run(resolve('integrations/stream-avatars/companion.lua'), 'wire-contract', fixture);
        expect({ status: result.status, stderr: result.stderr, stdout: result.stdout.trim() }).toEqual({ status: 0, stderr: '', stdout: 'OK wire-contract' });
    } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('companion works with Windows CRLF source and a script path containing spaces', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sa windows '));
    try {
        const script = join(directory, 'gaming computer companion.lua');
        writeFileSync(script, readFileSync(resolve('integrations/stream-avatars/companion.lua'), 'utf8').replace(/\r?\n/g, '\r\n'));
        const result = run(script, 'movement'); expect(result.status).toBe(0); expect(result.stdout.trim()).toBe('OK movement');
    } finally { rmSync(directory, { recursive: true, force: true }); }
});
// Prove these tests reject plausible defects, rather than merely executing happy paths.
test.each([
    ['auth', 'token=settings.token', 'token="wrong-token"'],
    ['expiry', 'effect={ends=elapsed+5', 'effect={ends=elapsed+50'],
    ['expiry', 'value.expiresAtMs>elapsed*1000+serverOffset', 'true'],
    ['invalid', 'and not seen[value.id]', ''],
    ['stale-control', 'value.generation<generationFloor', 'false'],
    ['close-open-race', 'get("sa_disconnect_pending") or', 'false or'],
    ['density-rotation', 'rotation=rotation+snapshot.render.maxHearts', 'rotation=0'],
    ['cleanup', 'pcall(entry.object.destroy)', 'pcall(function() end)'],
    ['movement', 'object.image.anchor("center",true)', 'object.image.anchor("bottom left",true)'],
    ['crowd', 'app.platformServiceSettings.SetUserLeave(id)', 'app.platformServiceSettings.SetUserLeave(900099)'],
    ['backoff', 'retryDelay=math.min(30,retryDelay*2)', 'retryDelay=math.min(60,retryDelay*2)']
])('Lua regression detects mutation %s / %s', (scenario, original, broken) => {
    const directory = mkdtempSync(join(tmpdir(), 'sa-mutation-'));
    try {
        const source = readFileSync(resolve('integrations/stream-avatars/companion.lua'), 'utf8');
        if (!source.includes(original)) throw new Error('Mutation target moved; update the behavioral mutation');
        const script = join(directory, 'companion.lua'); writeFileSync(script, source.replaceAll(original, broken));
        const result = run(script, scenario);
        expect(result.error).toBeUndefined(); expect(result.status).toBe(1); expect(result.stderr).toMatch(/assertion failed|must|density|disconnect/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
});
