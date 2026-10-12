const { publicCampaign } = require('../src/streamAvatars/protocol');
const { once } = require('node:events');
const WebSocket = require('ws');
const { startBridgeServer } = require('../src/streamAvatars/server');
const { createCampaignState } = require('../src/streamAvatars/campaignState');
const token = 'a'.repeat(32);
const snapshot = () => ({ version: 3, type: 'snapshot', mode: 'production', generation: 1, serverNowMs: Date.now(), campaign: publicCampaign(createCampaignState({ mode: 'production', participantId: '12' })), integration: { active: false, crowdIds: [] }, features: ['hearts'] });
let server; let clients;
beforeEach(() => { clients = []; });
afterEach(async () => { clients.forEach(client => client.terminate()); await server?.stop(); server = null; });
async function start(extra = {}) { server = await startBridgeServer({ config: { host: '127.0.0.1', port: 0, token, authTimeoutMs: 50, ...extra }, getSnapshot: snapshot, onClientMessage: async () => {}, logger: { warn() {}, info() {} } }); }
async function connect(path = '/sa/socket') { const socket = new WebSocket(`ws://127.0.0.1:${server.address.port}${path}`); clients.push(socket); await once(socket, 'open'); return socket; }
test('authenticates before snapshot and reconnect sends current state without old effects', async () => {
    await start(); const socket = await connect(); const received = []; socket.on('message', value => received.push(JSON.parse(value)));
    expect(received).toEqual([]); const first = once(socket, 'message'); socket.send(JSON.stringify({ version: 3, type: 'auth', token })); await first;
    expect(received[0].type).toBe('snapshot');
    const closing = once(socket, 'close'); socket.close(); await closing;
    expect(server.send({ version: 3, type: 'hearts', mode: 'production', generation: 1, campaignId: 's', id: 'old', issuedAtMs: Date.now(), expiresAtMs: Date.now() + 10000, durationMs: 5000 })).toBe(false);
    const next = await connect(); const ready = once(next, 'message'); next.send(JSON.stringify({ version: 3, type: 'auth', token }));
    expect(JSON.parse((await ready)[0]).type).toBe('snapshot');
});
test.each([{ version: 3, type: 'auth', token: 'wrong' }, { version: 3, type: 'ready', capabilities: [], resolution: { width: 1, height: 1 } }, { version: 3, type: 'auth', token, lua: 'loadstring' }])('rejects unauthenticated or unknown actions without state disclosure', async message => {
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
    socket.send(JSON.stringify({ version: 3, type: 'auth', token })); await ready;
    const closing = once(socket, 'close'); let refused = 0;
    for (let index = 0; index < 40; index++) if (!server.send(snapshot())) refused++;
    await closing; expect(refused).toBeGreaterThan(0);
    expect(server.send(snapshot())).toBe(false);
});

test('valid coalesced client frames are serialized rather than rejected', async () => {
    const seen = []; let complete; const handled = new Promise(resolve => { complete = resolve; });
    server = await startBridgeServer({ config: { host: '127.0.0.1', port: 0, token }, getSnapshot: snapshot,
        onClientMessage: async message => { seen.push(message.type); if (seen.length === 2) complete(); } });
    const socket = await connect(); const snapshotReceived = once(socket, 'message');
    socket.send(JSON.stringify({ version: 3, type: 'auth', token })); await snapshotReceived;
    const closed = once(socket, 'close').then(() => 'closed');
    socket._socket.cork();
    socket.send(JSON.stringify({ version: 3, type: 'ready', capabilities: ['hearts', 'campaign', 'celebrations', 'donation-recognition'], resolution: { width: 1920, height: 200 } }));
    socket.send(JSON.stringify({ version: 3, type: 'heartbeat' })); socket._socket.uncork();
    expect(await Promise.race([handled.then(() => 'handled'), closed])).toBe('handled');
    expect(seen).toEqual(['ready', 'heartbeat']); expect(socket.readyState).toBe(WebSocket.OPEN);
});

test('old companion receives actionable v2 import rejection',async()=>{await start();const socket=await connect();const closed=once(socket,'close');socket.send(JSON.stringify({version:1,type:'auth',token}));const [code,reason]=await closed;expect(code).toBe(1008);expect(reason.toString()).toContain('latest companion v3');});

test('v3 companion without celebration capability receives an actionable rejection', async () => {
    await start(); const socket = await connect(); const snapshotReceived = once(socket, 'message');
    socket.send(JSON.stringify({ version: 3, type: 'auth', token })); await snapshotReceived;
    const closed = once(socket, 'close'); socket.send(JSON.stringify({ version: 3, type: 'ready', capabilities: ['hearts'], resolution: { width: 1920, height: 1080 } }));
    const [code, reason] = await closed; expect(code).toBe(1008); expect(reason.toString()).toContain('companion v3');
    expect(server.getStatus().readyClients).toBe(0);
});

async function rejectsOldCompanion(startServer) {
    let admitted;const accepted=new Promise(resolve=>{admitted=resolve;});
    server=await startServer({config:{host:'127.0.0.1',port:0,token},getSnapshot:snapshot,onClientMessage:async()=>admitted({accepted:true})});
    const socket=await connect();const first=once(socket,'message');socket.send(JSON.stringify({version:3,type:'auth',token}));await first;
    const result=Promise.race([once(socket,'close').then(([code,reason])=>({code,reason:reason.toString()})),accepted]);
    socket.send(JSON.stringify({version:3,type:'ready',capabilities:['campaign','celebrations'],resolution:{width:1920,height:1080}}));socket.send(JSON.stringify({version:3,type:'heartbeat'}));
    expect(await result).toMatchObject({code:1008,reason:expect.stringContaining('latest companion')});expect(server.getStatus().readyClients).toBe(0);
}
test('old celebration-only companion is rejected before being counted ready', () => rejectsOldCompanion(startBridgeServer));
test('old companion readiness regression detects a removed capability gate', async () => {
    const { readFileSync } = require('node:fs');
    const Module = require('node:module');
    const file = require.resolve('../src/streamAvatars/server');
    const source = readFileSync(file, 'utf8');
    const gate = ' || !message.capabilities.includes(\'donation-recognition\')';
    expect(source).toContain(gate);
    const mutated = new Module(file, module); mutated.filename = file; mutated.paths = Module._nodeModulePaths(require('node:path').dirname(file));
    mutated._compile(source.replace(gate, ''), file);
    await expect(rejectsOldCompanion(mutated.exports.startBridgeServer)).rejects.toThrow(/toMatchObject/);
});

test('entrances require themes ready capability per connection while hearts retain older support', async () => {
    let ready; const readyHandled = new Promise(resolve => { ready = resolve; });
    server = await startBridgeServer({ config: { host: '127.0.0.1', port: 0, token }, getSnapshot: snapshot, onClientMessage: async message => { if (message.type === 'ready') ready(); } });
    const old = await connect(); let pending = once(old, 'message'); old.send(JSON.stringify({ version: 3, type: 'auth', token })); await pending;
    const modern = await connect(); pending = once(modern, 'message'); modern.send(JSON.stringify({ version: 3, type: 'auth', token })); await pending;
    const value = { version: 3, type: 'game-entrance', mode: 'production', generation: 1, campaignId: 's', id: 'e', gameIdentity: 'a'.repeat(64), themeId: 'party', issuedAtMs: 1000, expiresAtMs: 11000, durationMs: 6000 };
    expect(server.send(value)).toBe(false);
    const upgraded = once(modern, 'message');
    modern.send(JSON.stringify({ version: 3, type: 'ready', capabilities: ['campaign','celebrations','donation-recognition','themes'], resolution: { width: 1920, height: 1080 } })); await readyHandled; await upgraded;
    const oldMessages = []; old.on('message', raw => oldMessages.push(JSON.parse(raw))); pending = once(modern, 'message');
    expect(server.send(value)).toBe(true); expect(JSON.parse((await pending)[0]).type).toBe('game-entrance');
    pending = once(old, 'message'); server.send({ version: 3, type: 'hearts', mode: 'production', generation: 1, campaignId: 's', id: 'h', issuedAtMs: 1000, expiresAtMs: 11000, durationMs: 5000 }); await pending;
    expect(oldMessages.map(value => value.type)).toEqual(['hearts']);
});

test('old v3 companions receive their exact snapshot shape even when themes are active', async () => {
    const themed = { ...snapshot(), features: ['campaign','celebrations','donation-recognition','themes'], theme: { gameIdentity: 'a'.repeat(64), gameName: 'Minecraft', themeId: 'block-world', packRevision: 'b'.repeat(64) } };
    let admitted; const ready = new Promise(resolve => { admitted = resolve; });
    server = await startBridgeServer({ config: { host: '127.0.0.1', port: 0, token }, getSnapshot: () => themed, onClientMessage: async message => { if (message.type === 'ready') admitted(); } });
    const old = await connect(); let pending = once(old, 'message'); old.send(JSON.stringify({ version: 3, type: 'auth', token }));
    const first = JSON.parse((await pending)[0]); expect(first).not.toHaveProperty('theme'); expect(first.features).not.toContain('themes');
    old.send(JSON.stringify({ version: 3, type: 'ready', capabilities: ['campaign','celebrations','donation-recognition'], resolution: { width: 1920, height: 1080 } })); await ready;
    pending = once(old, 'message'); server.send(themed); expect(JSON.parse((await pending)[0])).toEqual(first);
    const { spawnSync } = require('node:child_process'); const { mkdtempSync, writeFileSync, rmSync } = require('node:fs'); const { join, resolve } = require('node:path'); const { tmpdir } = require('node:os');
    const directory = mkdtempSync(join(tmpdir(), 'old-v3-wire-'));
    try {
        const fixture = join(directory, 'snapshot.json');
        writeFileSync(fixture, JSON.stringify({ ...first, serverNowMs: 1000, mode: 'integration', campaign: { ...first.campaign, campaignId: 'session_é' }, integration: { active: true, crowdIds: [] } }));
        const result = spawnSync(process.env.LUA_BIN || 'lua', [resolve('tests/lua/companionHarness.lua'), resolve('tests/fixtures/stream-avatars-v3-companion.lua'), 'wire-contract', fixture], { encoding: 'utf8', timeout: 5000 });
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    } finally { rmSync(directory, { recursive: true, force: true }); }
});
