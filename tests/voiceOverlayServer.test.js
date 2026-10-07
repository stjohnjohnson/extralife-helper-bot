const http = require('node:http');
const { startOverlayServer } = require('../src/voiceOverlay/server');
const { EventEmitter } = require('node:events');
function stateFixture() {
    const emitter = new EventEmitter();
    return { emitter, getSnapshot: () => ({ ready: true, revision: 1, members: [{ id: 'guest', avatarUrl: 'https://cdn.discordapp.com/a.png', speaking: false }] }),
        subscribe(listener) { emitter.on('snapshot', listener); return () => emitter.removeListener('snapshot', listener); } };
}
const logger = { info: jest.fn(), error: jest.fn() };
const config = { host: '127.0.0.1', port: 0 };
function request(port, path, method = 'GET') {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path, method }, response => {
            let body = ''; response.on('data', chunk => { body += chunk; });
            response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
        }); req.on('error', reject); req.end();
    });
}
test('serves exact overlay assets and rejects unknown routes/methods without filesystem access', async () => {
    const state = stateFixture(); const server = await startOverlayServer({ config, state, logger });
    try {
        const port = server.address.port;
        expect((await request(port, '/voice')).headers['content-type']).toContain('text/html');
        expect((await request(port, '/voice/browser.js')).headers['content-type']).toContain('javascript');
        expect((await request(port, '/voice/overlay.css')).headers['content-type']).toContain('text/css');
        expect((await request(port, '/voice/../../.env')).status).toBe(404);
        expect((await request(port, '/unknown')).status).toBe(404);
        expect((await request(port, '/voice', 'POST')).status).toBe(405);
    } finally { await server.stop(); }
});
test('SSE immediately supplies complete snapshots and releases clients on disconnect/stop', async () => {
    const state = stateFixture(); const server = await startOverlayServer({ config, state, logger });
    const streams = [];
    try {
        const connect = () => new Promise(resolve => {
            const req = http.get({ host: '127.0.0.1', port: server.address.port, path: '/voice/events' }, response => {
                const chunks = []; response.on('data', chunk => { chunks.push(chunk.toString()); resolve({ response, chunks }); });
            }); streams.push(req);
        });
        const a = await connect(); const b = await connect();
        expect(a.response.headers['content-type']).toContain('text/event-stream');
        expect(a.chunks.join('')).toContain('event: snapshot');
        expect(a.chunks.join('')).toContain('"members":[{"id":"guest"');
        state.emitter.emit('snapshot', { ready: false, revision: 2, members: [] });
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(b.chunks.join('')).toContain('"revision":2');
        streams[0].destroy(); await new Promise(resolve => setTimeout(resolve, 10));
        expect(state.emitter.listenerCount('snapshot')).toBe(1);
        await server.stop(); expect(state.emitter.listenerCount('snapshot')).toBe(0);
    } finally { streams.forEach(req => req.destroy()); await server.stop(); }
});
test('port conflicts reject startup and do not retain state listeners', async () => {
    const state = stateFixture(); const first = await startOverlayServer({ config, state, logger });
    try {
        await expect(startOverlayServer({ config: { ...config, port: first.address.port }, state, logger })).rejects.toThrow();
        expect(state.emitter.listenerCount('snapshot')).toBe(0);
    } finally { await first.stop(); }
});

test('named heartbeat reaches SSE clients and timers are removed on shutdown', async () => {
    const interval = jest.spyOn(global, 'setInterval');
    const state = stateFixture(); const server = await startOverlayServer({ config, state, logger });
    let req;
    try {
        const seen = new Promise(resolve => {
            req = http.get({ host: '127.0.0.1', port: server.address.port, path: '/voice/events' }, response => {
                response.once('data', () => {
                    response.once('data', chunk => resolve(chunk.toString()));
                    interval.mock.calls.find(call => call[1] === 15000)[0]();
                });
            });
        });
        expect(await seen).toContain('event: heartbeat');
    } finally { req?.destroy(); await server.stop(); interval.mockRestore(); }
});
test('backpressured clients disconnect instead of accumulating snapshots', async () => {
    const state = stateFixture(); const server = await startOverlayServer({ config, state, logger });
    const original = http.ServerResponse.prototype.write;
    const write = jest.spyOn(http.ServerResponse.prototype, 'write').mockImplementation(function(chunk, ...args) {
        return String(chunk).startsWith('event: snapshot') ? false : original.call(this, chunk, ...args);
    });
    try {
        await expect(request(server.address.port, '/voice/events')).rejects.toThrow();
        await new Promise(resolve => setImmediate(resolve));
        expect(state.emitter.listenerCount('snapshot')).toBe(0);
    } finally { write.mockRestore(); await server.stop(); }
});

test('shutdown closes sockets with incomplete HTTP headers', async () => {
    const net = require('node:net');
    const server = await startOverlayServer({ config, state: stateFixture(), logger });
    const socket = net.connect({ host: '127.0.0.1', port: server.address.port });
    let timeout;
    try {
        await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
        socket.write('GET /voice HTTP/1.1\r\nHost:');
        await new Promise(resolve => setTimeout(resolve, 10));
        await Promise.race([
            server.stop(),
            new Promise((resolve, reject) => { timeout = setTimeout(() => reject(new Error('Shutdown retained incomplete request socket')), 300); })
        ]);
    } finally { clearTimeout(timeout); socket.destroy(); await server.stop(); }
});
