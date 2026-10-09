const fs = require('node:fs/promises');
const { tmpdir } = require('node:os'); const { join } = require('node:path');
const { startStreamAvatars } = require('../src/streamAvatars');
const { parseAction } = require('../src/streamAvatars/rehearsal');
let directory; let service; let now;
beforeEach(async () => { directory = await fs.mkdtemp(join(tmpdir(), 'sa-preview-')); now = 10000000; });
afterEach(async () => { await service?.stop(); service = null; await fs.rm(directory, { recursive: true, force: true }); });
async function start(standalone = false) {
    service = await startStreamAvatars({ config: { twitch: { channel: 'streamer', viewerSampleIntervalSeconds: 60 }, streamAvatars: { config: { host: '127.0.0.1', port: 0, token: 'a'.repeat(32), stateDir: directory, graceMs: 900000 } } }, logger: { info() {}, warn() {} }, standalone, realClock: { nowMs: () => now } });
}
const command = text => service.dispatch(parseAction(text));
test('preview admission is fresh and crowd/clear cannot modify production state', async () => {
    await start(); expect((await command('rehearsal start')).status).toBe('denied');
    await service.observeProduction({ status: 'offline', observedAtMs: now });
    const productionFile = join(directory, 'production/state.json'); const before = await fs.readFile(productionFile, 'utf8');
    expect((await command('rehearsal start')).status).toBe('ok');
    await command('crowd 20'); expect(service.getStatus().crowdCount).toBe(20);
    await command('clear'); expect(service.getStatus()).toMatchObject({ mode: 'rehearsal', crowdCount: 0 });
    await command('rehearsal stop');
    expect(await fs.readFile(productionFile, 'utf8')).toBe(before);
    now += 200000; expect((await command('rehearsal start')).status).toBe('denied');
});
test('real live clears preview before any further crowd controls', async () => {
    await start(); await service.observeProduction({ status: 'offline', observedAtMs: now });
    await command('rehearsal start'); await command('crowd 10');
    now++; await service.observeProduction({ status: 'online', observedAtMs: now, startedAtMs: now - 3600000, streamId: 'real' });
    expect(service.getStatus()).toMatchObject({ mode: 'production', crowdCount: 0 });
    expect((await command('crowd 20')).status).toBe('denied');
});
test('standalone preview is temporary and does not create or load any persistent state', async () => {
    await start(true); await command('rehearsal start'); await command('crowd 100');
    const id = service.getStatus().state.sessionId; now += 5000;
    expect(service.getStatus().elapsedMs).toBe(5000);
    expect(await fs.readdir(directory)).toEqual([]);
    await service.stop(); await start(true); expect(service.getStatus().mode).toBe('production');
    await command('rehearsal start');
    expect(service.getStatus()).toMatchObject({ elapsedMs: 0, crowdCount: 0 });
    expect(service.getStatus().state.sessionId).not.toBe(id);
    expect(await fs.readdir(directory)).toEqual([]);
    await service.stop(); await service.stop(); expect((await command('rehearsal start')).status).toBe('unavailable');
});
test.each(['clock advance 1h', 'clock seek 5m', 'scenario reconnect', 'hue on', 'hue off', 'rehearsal reset', 'crowd join 1', 'crowd leave 1', 'crowd -1', 'crowd 101', 'hearts extra', 'rehearsal start extra'])('unsupported control is rejected: %s', input => {
    expect(() => parseAction(input)).toThrow(/Use|Invalid/);
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
