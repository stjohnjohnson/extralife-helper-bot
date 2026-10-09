const { publicSession } = require('../src/streamAvatars/protocol');
const http = require('node:http');
const net = require('node:net');
const { once, EventEmitter } = require('node:events');
const WebSocket = require('ws');
const { startWebServer } = require('../src/webServer');
const { startOverlayServer } = require('../src/voiceOverlay/server');
const { startBridgeServer } = require('../src/streamAvatars/server');
const { createInitialState } = require('../src/broadcastSession/state');
const config = { host: '127.0.0.1', port: 0 };
const token = 'a'.repeat(32);
const snapshot = () => ({ version: 2, type: 'snapshot', mode: 'production', generation: 1, serverNowMs: 100,
    session: publicSession(createInitialState({ mode: 'production', channel: 'test' })), elapsedMs: 0,
    integration: { active: false, crowdIds: [] }, features: ['hearts'] });
function request(port, path) {
    return new Promise((resolve, reject) => {
        const req = http.get({ host: config.host, port, path }, response => {
            let body = ''; response.on('data', chunk => { body += chunk; });
            response.on('end', () => resolve({ status: response.statusCode, body, headers: response.headers }));
        }); req.on('error', reject);
    });
}
let web; let voice; let bridge; let sockets; let streams;
beforeEach(async () => { sockets = []; streams = []; web = await startWebServer({ config }); });
afterEach(async () => {
    streams.forEach(stream => stream.destroy()); sockets.forEach(socket => socket.terminate());
    await voice?.stop(); await bridge?.stop(); await web.stop(); voice = bridge = null;
});
async function connect(path = '/sa/socket') {
    const socket = new WebSocket(`ws://${config.host}:${web.address.port}${path}`); sockets.push(socket);
    await once(socket, 'open'); return socket;
}
async function attachVoice() {
    const emitter = new EventEmitter();
    voice = await startOverlayServer({ config, webServer: web, state: { getSnapshot: () => ({ ready: true, revision: 1, members: [] }),
        subscribe(listener) { emitter.on('snapshot', listener); return () => emitter.off('snapshot', listener); } } });
    return emitter;
}
async function attachBridge() { bridge = await startBridgeServer({ config: { ...config, token }, webServer: web, getSnapshot: snapshot }); }
async function authenticated() {
    const socket = await connect(); const received = once(socket, 'message');
    socket.send(JSON.stringify({ version: 2, type: 'auth', token }));
    expect(JSON.parse((await received)[0]).type).toBe('snapshot'); return socket;
}
async function sse() {
    return new Promise((resolve, reject) => {
        const req = http.get({ host: config.host, port: web.address.port, path: '/voice/events' }, response => {
            response.once('data', chunk => resolve({ response, chunk: chunk.toString() }));
        }); streams.push(req); req.on('error', reject);
    });
}
test('HTTP assets, live SSE and authenticated WebSocket share one listener', async () => {
    await attachVoice(); await attachBridge();
    expect(voice.address.port).toBe(web.address.port); expect(bridge.address.port).toBe(web.address.port);
    expect((await request(web.address.port, '/voice?preview=5')).status).toBe(200);
    expect((await sse()).chunk).toContain('event: snapshot');
    await authenticated(); expect(bridge.getStatus().authenticatedClients).toBe(1);
    expect((await request(web.address.port, '/sa/socket')).status).toBe(404);
    expect((await request(web.address.port, '/unknown')).status).toBe(404);
});
test('voice shutdown releases SSE subscriptions while the companion remains connected', async () => {
    const emitter = await attachVoice(); await attachBridge(); await sse(); const socket = await authenticated();
    await voice.stop(); expect(emitter.listenerCount('snapshot')).toBe(0);
    expect((await request(web.address.port, '/voice')).status).toBe(404);
    const received = once(socket, 'message'); bridge.send(snapshot()); expect(JSON.parse((await received)[0]).type).toBe('snapshot');
    await attachVoice(); expect((await request(web.address.port, '/voice')).status).toBe(200);
});
test('bridge shutdown removes its upgrade route while existing SSE keeps receiving snapshots', async () => {
    const emitter = await attachVoice(); await attachBridge(); const stream = await sse(); const socket = await authenticated();
    const closed = once(socket, 'close'); await bridge.stop(); await closed;
    await expect(connect()).rejects.toThrow();
    const update = once(stream.response, 'data'); emitter.emit('snapshot', { ready: false, revision: 2, members: [] });
    expect((await update)[0].toString()).toContain('"revision":2');
    expect((await request(web.address.port, '/voice')).status).toBe(200);
    await attachBridge(); await authenticated();
});
test('bad authentication and unknown upgrade paths cannot disrupt voice routes', async () => {
    await attachVoice(); await attachBridge(); const socket = await connect(); const closed = once(socket, 'close');
    socket.send(JSON.stringify({ version: 2, type: 'auth', token: 'wrong' })); expect((await closed)[0]).toBe(1008);
    await expect(connect('/voice')).rejects.toThrow(); await expect(connect('/sa/socket?token=wrong')).rejects.toThrow();
    expect((await request(web.address.port, '/voice')).status).toBe(200);
});
test('duplicate registrations fail without replacing or unregistering the original integration', async () => {
    await attachVoice(); await attachBridge();
    await expect(startOverlayServer({ config, webServer: web, state: { getSnapshot() {}, subscribe() {} } })).rejects.toThrow(/registered/);
    await expect(startBridgeServer({ config: { ...config, token }, webServer: web, getSnapshot: snapshot })).rejects.toThrow(/registered/);
    expect((await request(web.address.port, '/voice')).status).toBe(200); await authenticated();
});
test('shared shutdown closes SSE, WebSocket and incomplete HTTP sockets and is idempotent', async () => {
    await attachVoice(); await attachBridge(); const stream = await sse(); const socket = await authenticated();
    const raw = net.connect({ host: config.host, port: web.address.port }); await once(raw, 'connect');
    raw.write('GET /voice HTTP/1.1\r\nHost:');
    const closed = Promise.all([socket, stream.response, raw].map(connection => {
        connection.on('error', () => {}); return new Promise(resolve => connection.once('close', resolve));
    }));
    await web.stop(); await web.stop(); await closed;
    await expect(request(web.address.port, '/voice')).rejects.toThrow();
    expect(() => web.registerHttp(['/late'], () => {})).toThrow(/stopped/);
});
test('occupied port and pre-aborted or in-flight startup reject and release the listener', async () => {
    await expect(startWebServer({ config: { ...config, port: web.address.port } })).rejects.toMatchObject({ code: 'EADDRINUSE' });
    const aborted = new AbortController(); aborted.abort();
    await expect(startWebServer({ config, signal: aborted.signal })).rejects.toThrow(/aborted/);
    const abort = new AbortController(); const starting = startWebServer({ config, signal: abort.signal }); abort.abort();
    await expect(starting).rejects.toThrow(/aborted/);
});
test('an aborted bridge registration leaves the shared listener available', async () => {
    await attachVoice(); const abort = new AbortController(); abort.abort();
    await expect(startBridgeServer({ config: { ...config, token }, webServer: web, signal: abort.signal, getSnapshot: snapshot })).rejects.toThrow(/aborted/);
    expect((await request(web.address.port, '/voice')).status).toBe(200);
});
