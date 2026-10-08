const { once } = require('node:events');
const WebSocket = require('ws');
const { startBridgeServer } = require('../src/streamAvatars/server');
const { createInitialState } = require('../src/broadcastSession/state');
const token = 'a'.repeat(32);
const snapshot = () => ({ version: 1, type: 'snapshot', mode: 'production', generation: 1, serverNowMs: Date.now(), session: createInitialState({ mode: 'production', channel: 'x' }), elapsedMs: 0, strip: { x: 0, y: 0, width: 100, height: 100 }, rehearsal: { active: false, crowdIds: [] }, render: { maxHearts: 50, heartOffset: 16 }, features: ['hearts'] });
let server; let clients;
beforeEach(() => { clients = []; });
afterEach(async () => { clients.forEach(client => client.terminate()); await server?.stop(); server = null; });
async function start(extra = {}) { server = await startBridgeServer({ config: { host: '127.0.0.1', port: 0, token, authTimeoutMs: 50, ...extra }, getSnapshot: snapshot, onClientMessage: async () => {}, logger: { warn() {}, info() {} } }); }
async function connect(path = '/sa/socket') { const socket = new WebSocket(`ws://127.0.0.1:${server.address.port}${path}`); clients.push(socket); await once(socket, 'open'); return socket; }
test('authenticates before snapshot and reconnect sends current state without old effects', async () => {
    await start(); const socket = await connect(); const received = []; socket.on('message', value => received.push(JSON.parse(value)));
    expect(received).toEqual([]); const first = once(socket, 'message'); socket.send(JSON.stringify({ version: 1, type: 'auth', token })); await first;
    expect(received[0].type).toBe('snapshot');
    const closing = once(socket, 'close'); socket.close(); await closing;
    expect(server.send({ version: 1, type: 'hearts', mode: 'production', generation: 1, sessionId: 's', id: 'old', issuedAtMs: Date.now(), expiresAtMs: Date.now() + 10000, durationMs: 5000 })).toBe(false);
    const next = await connect(); const ready = once(next, 'message'); next.send(JSON.stringify({ version: 1, type: 'auth', token }));
    expect(JSON.parse((await ready)[0]).type).toBe('snapshot');
});
test.each([{ version: 1, type: 'auth', token: 'wrong' }, { version: 1, type: 'ready', capabilities: [], resolution: { width: 1, height: 1 } }, { version: 1, type: 'auth', token, lua: 'loadstring' }])('rejects unauthenticated or unknown actions without state disclosure', async message => {
    await start(); const socket = await connect(); const closed = once(socket, 'close'); socket.send(JSON.stringify(message)); expect((await closed)[0]).toBe(1008);
});
test('unauthenticated idle, binary and oversize connections are closed', async () => {
    await start(); const idle = await connect(); expect((await once(idle, 'close'))[0]).toBe(1008);
    const binary = await connect(); const closed = once(binary, 'close'); binary.send(Buffer.from('test')); expect((await closed)[0]).toBe(1008);
    const large = await connect(); const largeClosed = once(large, 'close'); large.send('x'.repeat(65537)); expect((await largeClosed)[0]).toBe(1009);
});
test('invalid route, occupied port, aborted startup and shutdown clean resources', async () => {
    await start(); await expect(connect('/other')).rejects.toThrow();
    await expect(startBridgeServer({ config: { host: '127.0.0.1', port: server.address.port, token }, getSnapshot: snapshot })).rejects.toMatchObject({ code: 'EADDRINUSE' });
    const abort = new AbortController(); abort.abort(); await expect(startBridgeServer({ config: { host: '127.0.0.1', port: 0, token }, signal: abort.signal })).rejects.toThrow(/abort/i);
    await server.stop(); await server.stop();
});

test('bounds in-flight messages for a slow companion instead of accumulating an animation backlog', async () => {
    await start(); const socket = await connect(); const ready = once(socket, 'message');
    socket.send(JSON.stringify({ version: 1, type: 'auth', token })); await ready;
    const closing = once(socket, 'close'); let refused = 0;
    for (let index = 0; index < 40; index++) if (!server.send(snapshot())) refused++;
    await closing; expect(refused).toBeGreaterThan(0);
    expect(server.send(snapshot())).toBe(false);
});
