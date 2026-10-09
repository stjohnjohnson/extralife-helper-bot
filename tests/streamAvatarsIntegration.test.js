const fs = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { once } = require('node:events');
const WebSocket = require('ws');
const { startStreamAvatars } = require('../src/streamAvatars');
const http = require('node:http');
const { startWebServer } = require('../src/webServer');
const { parseAction } = require('../src/streamAvatars/rehearsal');
let directory; let service; let socket; let now; let webServer;
beforeEach(async () => {
    directory = await fs.mkdtemp(join(tmpdir(), 'sa-integration-')); now = 10000000;
    webServer = await startWebServer({ config: { host: '127.0.0.1', port: 0 } });
    webServer.registerHttp(['/health'], (req, res) => { res.end('other integration'); });
    service = await startStreamAvatars({ webServer, config: { twitch: { channel: 'streamer' }, streamAvatars: { config: {
        host: '127.0.0.1', port: 0, token: 't'.repeat(32), stateDir: directory, graceMs: 900000,
        strip: { x: -10.5, y: -8.25, width: 20, height: 5.5 }, maxHearts: 50, heartOffset: 1.5
    } } }, logger: { info() {}, warn() {} }, realClock: { nowMs: () => now } });
});
afterEach(async () => { socket?.terminate(); socket = null; await service.stop(); await webServer.stop(); await fs.rm(directory, { recursive: true, force: true }); });
const dispatch = input => service.dispatch(parseAction(input));
const waitFor = (type, accept = () => true) => new Promise(resolve => {
    const listener = raw => { const message = JSON.parse(raw); if (message.type === type && accept(message)) { socket.removeListener('message', listener); resolve(message); } };
    socket.on('message', listener);
});
test('rehearsal expires effects in wall time, clears on real live, and reconnects without replay', async () => {
    await service.observeProduction({ status: 'offline', observedAtMs: now });
    const productionFile = join(directory, 'production/state.json'); const before = await fs.readFile(productionFile, 'utf8');
    socket = new WebSocket(`ws://127.0.0.1:${service.address.port}/sa/socket`); await once(socket, 'open');
    let pending = waitFor('snapshot'); socket.send(JSON.stringify({ version: 1, type: 'auth', token: 't'.repeat(32) }));
    expect((await pending).mode).toBe('production');
    pending = waitFor('snapshot', message => message.mode === 'rehearsal' && message.session.sessionId !== null); await dispatch('rehearsal start'); const rehearsal = await pending;
    await dispatch('crowd 100'); await dispatch('clock advance 7h');
    pending = waitFor('hearts'); expect((await dispatch('hearts')).status).toBe('ok'); const effect = await pending;
    expect(effect).toMatchObject({ mode: 'rehearsal', issuedAtMs: now, expiresAtMs: now + 10000, durationMs: 5000, sessionId: rehearsal.session.sessionId });
    expect(await fs.readFile(productionFile, 'utf8')).toBe(before);
    pending = waitFor('clear'); now++; await service.observeProduction({ status: 'online', observedAtMs: now, startedAtMs: now - 3600000, streamId: 'real' });
    const clear = await pending; expect(clear.mode).toBe('production'); expect(clear.generation).toBeGreaterThan(effect.generation);
    expect(service.getStatus()).toMatchObject({ mode: 'production', crowdCount: 0 });
    socket.terminate(); socket = new WebSocket(`ws://127.0.0.1:${service.address.port}/sa/socket`); await once(socket, 'open');
    const received = []; socket.on('message', raw => received.push(JSON.parse(raw)));
    pending = waitFor('snapshot'); socket.send(JSON.stringify({ version: 1, type: 'auth', token: 't'.repeat(32) })); const resumed = await pending;
    expect(resumed).toMatchObject({ mode: 'production', rehearsal: { active: false, crowdIds: [] }, elapsedMs: 3600000 });
    expect(received.map(message => message.type)).toEqual(['snapshot']);
});
test('stale online and malformed observations cannot change rehearsal admission or preempt it', async () => {
    await service.observeProduction({ status: 'offline', observedAtMs: now }); await dispatch('rehearsal start');
    await service.observeProduction({ status: 'online', observedAtMs: now - 1, startedAtMs: now - 100, streamId: 'old' });
    expect(service.getStatus().mode).toBe('rehearsal');
    await service.observeProduction({ status: 'online', observedAtMs: now + 1, startedAtMs: now + 2, streamId: 'invalid' });
    expect(service.getStatus().mode).toBe('rehearsal');
    await dispatch('rehearsal stop'); expect((await dispatch('rehearsal start')).status).toBe('ok');
});


test('avatar service attaches to the application listener and stopping it preserves other routes', async () => {
    expect(service.address.port).toBe(webServer.address.port);
    socket = new WebSocket(`ws://127.0.0.1:${webServer.address.port}/sa/socket`); await once(socket, 'open');
    const received = waitFor('snapshot'); socket.send(JSON.stringify({ version: 1, type: 'auth', token: 't'.repeat(32) }));
    expect((await received).mode).toBe('production');
    const closed = once(socket, 'close'); await service.stop(); await closed;
    const response = await new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port: webServer.address.port, path: '/health' }, res => {
            let body = ''; res.on('data', chunk => { body += chunk; }); res.on('end', () => resolve(body));
        }); req.on('error', reject);
    });
    expect(response).toBe('other integration');
});
