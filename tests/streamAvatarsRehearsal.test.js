const fs = require('node:fs/promises');
const { tmpdir } = require('node:os'); const { join } = require('node:path');
const { startStreamAvatars } = require('../src/streamAvatars');
const { parseAction, createScenarioRegistry } = require('../src/streamAvatars/rehearsal');
let directory; let service; let now;
beforeEach(async () => { directory = await fs.mkdtemp(join(tmpdir(), 'sa-rehearsal-')); now = 10000000; });
afterEach(async () => { await service?.stop(); service = null; await fs.rm(directory, { recursive: true, force: true }); });
async function start(standalone = false, hue = null) {
    service = await startStreamAvatars({ config: { twitch: { channel: 'streamer', viewerSampleIntervalSeconds: 60 }, streamAvatars: { config: { host: '127.0.0.1', port: 0, token: 'a'.repeat(32), stateDir: directory, graceMs: 900000, strip: { x: 0, y: 0, width: 1000, height: 200 }, maxHearts: 50, heartOffset: 16 } } }, logger: { info() {}, warn() {} }, standalone, realClock: { nowMs: () => now }, hue });
}
const command = text => service.dispatch(parseAction(text));
test('offline admission is fresh and simulated actions cannot modify production state', async () => {
    await start(); expect((await command('rehearsal start')).status).toBe('denied');
    await service.observeProduction({ status: 'offline', observedAtMs: now });
    const productionFile = join(directory, 'production/state.json'); const before = await fs.readFile(productionFile, 'utf8');
    expect((await command('rehearsal start')).status).toBe('ok');
    await command('crowd 20'); expect(service.getStatus().crowdCount).toBe(20);
    await command('crowd leave 1'); await command('crowd join 100'); expect(service.getStatus().crowdCount).toBe(20);
    await command('clock advance 1h'); expect(service.getStatus().elapsedMs).toBe(3600000);
    await command('clock seek 5m'); expect(service.getStatus().elapsedMs).toBe(300000);
    expect(service.getStatus().state.recoveryBaselineMs).toBe(service.getStatus().state.startedAtMs + 300000);
    await command('rehearsal reset'); await command('rehearsal stop');
    expect(await fs.readFile(productionFile, 'utf8')).toBe(before);
    now += 200000; expect((await command('rehearsal start')).status).toBe('denied');
});
test('real live stops rehearsal before late commands and drops crowd and Hue permission', async () => {
    const hue = { celebrateDonation: jest.fn().mockResolvedValue() }; await start(false, hue);
    await service.observeProduction({ status: 'offline', observedAtMs: now }); await command('rehearsal start'); await command('crowd 10');
    expect(hue.celebrateDonation).not.toHaveBeenCalled(); await command('hue on');
    now += 1; await service.observeProduction({ status: 'online', observedAtMs: now, startedAtMs: now - 3600000, streamId: 'real' });
    expect(service.getStatus()).toMatchObject({ mode: 'production', crowdCount: 0, hueEnabled: false });
    expect((await command('crowd 20')).status).toBe('denied');
});
test('standalone scenarios retain progress without production files, until sustained offline creates fresh session', async () => {
    await start(true); await command('rehearsal start'); await command('clock advance 1h');
    const original = service.getStatus().state;
    for (const scenario of ['reconnect', 'changed-stream', 'api-error', 'restart']) {
        expect((await command('scenario ' + scenario)).status).toBe('ok');
        expect(service.getStatus().state).toMatchObject({ sessionId: original.sessionId, startedAtMs: original.startedAtMs, liveTotalCents: 0 });
    }
    await expect(fs.access(join(directory, 'production/state.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    const old = service.getStatus().state.sessionId; await command('scenario sustained-offline');
    expect(service.getStatus().state.sessionId).not.toBe(old);
    expect((await command('hearts')).status).toBe('unavailable');
    expect((await command('scenario donation')).status).toBe('unavailable');
});
test('restart is inactive until explicit resume and stop is idempotent', async () => {
    await start(true); await command('rehearsal start'); await command('clock advance 7h'); const id = service.getStatus().state.sessionId;
    await service.stop(); await start(true); expect(service.getStatus().mode).toBe('production');
    await command('rehearsal start'); expect(service.getStatus()).toMatchObject({ elapsedMs: 25200000, state: { sessionId: id } });
    await service.stop(); await service.stop(); expect((await command('rehearsal start')).status).toBe('unavailable');
});
test.each(['crowd -1','crowd 101','crowd join 0','clock seek -1h','clock advance 49h','scenario ../../file','hearts extra','rehearsal start extra','hue perhaps'])('rejects malformed action %s', input => { expect(() => parseAction(input)).toThrow(/Use|Invalid/); });
test('trusted scenario registry validates registration and supports future slices without executable names', async () => {
    const registry = createScenarioRegistry(); let result = null;
    const remove = registry.registerScenario({ name: 'future-goal', parseArgs: args => args, run: async args => { result = args; } });
    await registry.run('future-goal', ['500'], {}); expect(result).toEqual(['500']); remove();
    await expect(registry.run('future-goal', [], {})).rejects.toThrow(/unavailable/i);
    expect(() => registry.registerScenario({ name: '../script', parseArgs: x => x, run() {} })).toThrow(/Invalid/);
});

test('backward seek after changed stream metadata retains valid persisted progress', async () => {
    await start(true); await command('rehearsal start'); const id = service.getStatus().state.sessionId;
    await command('clock advance 1h'); await command('scenario changed-stream');
    expect((await command('clock seek 5m')).status).toBe('ok');
    expect(service.getStatus()).toMatchObject({ elapsedMs: 300000, state: { sessionId: id } });
});

test('a real live observation cancels a queued rehearsal start', async () => {
    await start(); await service.observeProduction({ status: 'offline', observedAtMs: now });
    const pending = command('rehearsal start'); now += 1;
    await service.observeProduction({ status: 'online', observedAtMs: now, startedAtMs: now, streamId: 'real' });
    expect((await pending).status).toBe('unavailable'); expect(service.getStatus().mode).toBe('production');
});
test('ordinary online samples do not clear an ongoing production effect', async () => {
    const WebSocket = require('ws'); const { once } = require('node:events');
    await start(); const socket = new WebSocket(`ws://127.0.0.1:${service.address.port}/sa/socket`); await once(socket, 'open');
    const received = []; socket.on('message', raw => received.push(JSON.parse(raw)));
    const nextSnapshot = () => new Promise(resolve => { const handle = raw => { if (JSON.parse(raw).type === 'snapshot') { socket.removeListener('message', handle); resolve(); } }; socket.on('message', handle); });
    try {
        let wait = nextSnapshot(); socket.send(JSON.stringify({ version: 1, type: 'auth', token: 'a'.repeat(32) })); await wait;
        wait = nextSnapshot(); await service.observeProduction({ status: 'online', observedAtMs: now, startedAtMs: now, streamId: 'real' }); await wait;
        received.length = 0; now += 1;
        wait = nextSnapshot(); await service.observeProduction({ status: 'online', observedAtMs: now, startedAtMs: now - 1, streamId: 'real' }); await wait;
        expect(received.filter(message => message.type === 'clear')).toEqual([]);
    } finally { socket.terminate(); }
});

test('production recovery/reset targets are separate and reset requires confirmed offline', async () => {
    await start(); expect((await command('session reset confirm')).status).toBe('denied');
    await service.observeProduction({ status: 'online', observedAtMs: now, startedAtMs: now - 3600000, streamId: 'real' });
    expect((await command('session reset confirm')).status).toBe('denied');
    now++; await service.observeProduction({ status: 'offline', observedAtMs: now });
    expect((await command('session reset confirm')).status).toBe('ok'); expect(service.getStatus().state.sessionId).toBeNull();
    expect((await command('session recover confirm')).status).toBe('ok'); expect(service.getStatus().state.sessionId).not.toBeNull();
});
