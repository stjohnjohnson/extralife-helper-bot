const fs = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { once } = require('node:events');
const WebSocket = require('ws');
const { startStreamAvatars } = require('../src/streamAvatars');
const http = require('node:http');
const { startWebServer } = require('../src/webServer');
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
const waitFor = (type, accept = () => true) => new Promise(resolve => {
    const listener = raw => { const message = JSON.parse(raw); if (message.type === type && accept(message)) { socket.removeListener('message', listener); resolve(message); } };
    socket.on('message', listener);
});
test('stale and malformed observations preserve the current production session', async () => {
    await service.observeProduction({ status: 'online', observedAtMs: now, startedAtMs: now-1000, streamId: 'real' });
    const before=service.getStatus().state;
    await service.observeProduction({ status: 'online', observedAtMs: now-1, startedAtMs: now-2000, streamId: 'old' });
    await service.observeProduction({ status: 'online', observedAtMs: now+1, startedAtMs: now+2, streamId: 'invalid' });
    expect(service.getStatus().state).toEqual(before);
});

test('avatar service attaches to the application listener and stopping it preserves other routes', async () => {
    expect(service.address.port).toBe(webServer.address.port);
    socket = new WebSocket(`ws://127.0.0.1:${webServer.address.port}/sa/socket`); await once(socket, 'open');
    const received = waitFor('snapshot'); socket.send(JSON.stringify({ version: 2, type: 'auth', token: 't'.repeat(32) }));
    expect((await received).mode).toBe('production');
    const closed = once(socket, 'close'); await service.stop(); await closed;
    const response = await new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port: webServer.address.port, path: '/health' }, res => {
            let body = ''; res.on('data', chunk => { body += chunk; }); res.on('end', () => resolve(body));
        }); req.on('error', reject);
    });
    expect(response).toBe('other integration');
});
