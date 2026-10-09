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
    service = await startStreamAvatars({ webServer, config: { participantId: '123', streamAvatars: { config: {
        host: '127.0.0.1', port: 0, token: 't'.repeat(32), stateDir: directory, 
        strip: { x: -10.5, y: -8.25, width: 20, height: 5.5 }, maxHearts: 50, heartOffset: 1.5
    } } }, logger: { info() {}, warn() {} }, realClock: { nowMs: () => now } });
});
afterEach(async () => { socket?.terminate(); socket = null; await service.stop(); await webServer.stop(); await fs.rm(directory, { recursive: true, force: true }); });
const waitFor = (type, accept = () => true) => new Promise(resolve => {
    const listener = raw => { const message = JSON.parse(raw); if (message.type === type && accept(message)) { socket.removeListener('message', listener); resolve(message); } };
    socket.on('message', listener);
});
test('stale and malformed campaign observations preserve durable totals', async () => {
    const accept = campaign => service.acceptObservation({ expectedEpochId: service.getPollCheckpoint().epochId, batchId: 'batch', observedAtMs: now, campaign });
    await accept({ observedAtMs: now, totalCents: 90000, goalCents: 100000 });
    const before = service.getStatus().campaignTotalCents;
    await accept({ observedAtMs: now - 1, totalCents: 100000, goalCents: 100000 });
    expect((await accept({ observedAtMs: now, totalCents: -1, goalCents: 100000 })).diagnostics).toContain('invalid-campaign');
    expect(service.getStatus().campaignTotalCents).toBe(before);
});

test('avatar service attaches to the application listener and stopping it preserves other routes', async () => {
    expect(service.address.port).toBe(webServer.address.port);
    socket = new WebSocket(`ws://127.0.0.1:${webServer.address.port}/sa/socket`); await once(socket, 'open');
    const received = waitFor('snapshot'); socket.send(JSON.stringify({ version: 3, type: 'auth', token: 't'.repeat(32) }));
    expect((await received).mode).toBe('production');
    const closed = once(socket, 'close'); await service.stop(); await closed;
    const response = await new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port: webServer.address.port, path: '/health' }, res => {
            let body = ''; res.on('data', chunk => { body += chunk; }); res.on('end', () => resolve(body));
        }); req.on('error', reject);
    });
    expect(response).toBe('other integration');
});

test('production keeps default randomness independently of developer action settings', async () => {
    await service.stop();
    const draw = jest.spyOn(Math, 'random').mockReturnValue(0.1);
    try {
        service = await startStreamAvatars({ webServer, config: { participantId: '123', twitch: { channel: 'streamer' }, streamAvatars: { config: {
            token: 't'.repeat(32), stateDir: directory,  recognitionAction: 'hug'
        } } }, logger: { info() {}, warn() {} }, realClock: { nowMs: () => now } });
        const accept = donations => service.acceptObservation({ expectedEpochId: service.getPollCheckpoint().epochId,
            batchId: 'batch', complete: true, donations, observedAtMs: now });
        await accept([]);
        socket = new WebSocket(`ws://127.0.0.1:${webServer.address.port}/sa/socket`); await once(socket, 'open');
        const first = waitFor('snapshot'); socket.send(JSON.stringify({ version: 3, type: 'auth', token: 't'.repeat(32) })); await first;
        socket.send(JSON.stringify({ version: 3, type: 'ready', capabilities: ['campaign', 'celebrations', 'donation-recognition'], resolution: { width: 1920, height: 1080 } }));
        for (let i = 0; i < 30 && !service.getStatus().companionReady; i++) await new Promise(resolve => setTimeout(resolve, 2));
        expect(service.getStatus().companionReady).toBe(true);
        const received = waitFor('celebration'); now++;
        await accept([{ id: 'live', participantId: '123', createdAtMs: now - 1, amountCents: 2500 }]);
        expect(await received).toMatchObject({ recognitionAction: 'jump', donationCount: 1, donationTotalCents: 2500 });
        expect(draw).toHaveBeenCalledTimes(1);
    } finally { draw.mockRestore(); }
});

async function connectThemes() {
    socket = new WebSocket(`ws://127.0.0.1:${service.address.port}/sa/socket`); await once(socket, 'open');
    const pending = waitFor('snapshot'); socket.send(JSON.stringify({ version: 3, type: 'auth', token: 't'.repeat(32) })); await pending;
    socket.send(JSON.stringify({ version: 3, type: 'ready', capabilities: ['campaign','celebrations','donation-recognition','themes'], resolution: { width: 1920, height: 1080 } }));
    // A subsequent heartbeat reaches the same serialized inbound tail after capability registration.
    await new Promise(resolve => setImmediate(resolve));
}
const observeGame = (gameName, at = now, source = 'twitch') => service.observeGame({ gameName, observedAtMs: at, source });
const online = () => service.observeProduction({ status: 'online', observedAtMs: now, startedAtMs: now - 1000, streamId: 'stream' });
test('first reconciliation persists without entrance; a shared-theme change sends snapshot then one entrance', async () => {
    await online(); await connectThemes(); const received = []; socket.on('message', raw => received.push(JSON.parse(raw)));
    let pending = waitFor('snapshot', value => value.theme?.gameName === 'Minecraft'); await observeGame('Minecraft'); await pending;
    expect(received.map(value => value.type)).toEqual(['snapshot']);
    now++; pending = waitFor('game-entrance'); await observeGame('Raft'); const entrance = await pending;
    const durable = JSON.parse(await fs.readFile(join(directory, 'production/state.json'), 'utf8'));
    expect(entrance).toMatchObject({ gameIdentity: durable.game.identity, themeId: 'outdoor', durationMs: 6000, expiresAtMs: now + 10000, campaignId: '123' });
    now++; pending = waitFor('game-entrance'); await observeGame('PEAK'); await pending;
    expect(received.filter(value => value.type === 'game-entrance')).toHaveLength(2);
    now++; await observeGame('PEAK'); await observeGame('Minecraft', now - 1); expect(service.getStatus().game.displayName).toBe('PEAK');
    expect(received.filter(value => value.type === 'game-entrance')).toHaveLength(2);
});
test('PATCH ordering beats late old polls; ties prefer Twitch and newer manual categories win', async () => {
    await online(); await observeGame('Minecraft'); now += 10; await observeGame('PlateUp!', now, 'discord-category');
    await observeGame('Minecraft', now - 5); expect(service.getStatus().game.displayName).toBe('PlateUp!');
    await observeGame('Raft', now); await observeGame('PlateUp!', now, 'discord-category'); expect(service.getStatus().game.displayName).toBe('Raft');
    now++; await observeGame('Just Chatting'); expect(service.getStatus().game).toMatchObject({ displayName: 'Just Chatting', themeId: null });
    now++; await observeGame(''); expect(service.getStatus().game.displayName).toBe('Just Chatting');
});
test('offline, stale live and rehearsal cannot write production games or send entrances', async () => {
    await observeGame('Minecraft'); expect(service.getStatus().game).toBeNull();
    await service.observeProduction({ status: 'offline', observedAtMs: now }); await dispatch('rehearsal start');
    await observeGame('Raft'); expect(service.getStatus().game).toBeNull();
    now++; await online(); await observeGame('Minecraft');
    now += 120001; await observeGame('Raft'); expect(service.getStatus().game.displayName).toBe('Minecraft');
    await service.observeProduction({ status: 'offline', observedAtMs: now }); await observeGame('Raft'); expect(service.getStatus().game.displayName).toBe('Minecraft');
});
test('restart and reconnect restore latest game with no entrance; first reconciliation stays quiet', async () => {
    await online(); await observeGame('Minecraft'); now++; await observeGame('Raft');
    await service.stop();
    service = await startStreamAvatars({ webServer, config: { twitch: { channel: 'streamer' }, streamAvatars: { config: { token: 't'.repeat(32), stateDir: directory, graceMs: 900000 } } }, logger: { warn() {} }, realClock: { nowMs: () => now } });
    await connectThemes(); const received = []; socket.on('message', raw => received.push(JSON.parse(raw))); now++;
    await online(); const pending = waitFor('snapshot', value => value.theme?.gameName === 'PlateUp!'); await observeGame('PlateUp!'); await pending;
    expect(received.every(value => ['snapshot', 'clear'].includes(value.type))).toBe(true);
});
test('disconnected transitions restore snapshot on reconnect without queued entrance; reset clears game', async () => {
    await online(); await observeGame('Minecraft'); now++; await observeGame('Raft');
    socket = new WebSocket(`ws://127.0.0.1:${service.address.port}/sa/socket`); await once(socket, 'open');
    const received = []; socket.on('message', raw => received.push(JSON.parse(raw)));
    let pending = waitFor('snapshot'); socket.send(JSON.stringify({ version: 3, type: 'auth', token: 't'.repeat(32) })); const snapshot = await pending;
    expect(snapshot.theme).toMatchObject({ gameName: 'Raft', themeId: 'outdoor' }); expect(received.map(value => value.type)).toEqual(['snapshot']);
    now++; await service.observeProduction({ status: 'offline', observedAtMs: now });
    pending = waitFor('snapshot', value => value.theme === null); expect((await dispatch('session reset confirm')).status).toBe('ok'); await pending;
    expect(service.getStatus().game).toBeNull(); expect(received.some(value => value.type === 'game-entrance')).toBe(false);
});
test('invalid theme configuration keeps production hearts available', async () => {
    await service.stop();
    service = await startStreamAvatars({ webServer, config: { twitch: { channel: 'streamer' }, streamAvatars: { config: { token: 't'.repeat(32), stateDir: directory, graceMs: 900000, themes: { enabled: false, config: null, errors: ['Invalid Stream Avatars theme configuration'] } } } }, logger: { warn() {} }, realClock: { nowMs: () => now } });
    await online(); await connectThemes(); await observeGame('Minecraft'); expect(service.getStatus().game).toBeNull();
    const pending = waitFor('hearts'); expect((await dispatch('hearts')).status).toBe('ok'); expect((await pending).durationMs).toBe(5000);
});
test('reset admission is serialized after an already queued live observation', async () => {
    await service.observeProduction({ status: 'offline', observedAtMs: now }); now++;
    const becomingLive = online(); const reset = dispatch('session reset confirm'); await becomingLive;
    expect((await reset).status).toBe('denied'); expect(service.getStatus().state.sessionId).not.toBeNull();
});
test('an overlapping old Twitch read cannot undo a completed category write or emit another entrance', async () => {
    await online(); await observeGame('Minecraft'); await connectThemes();
    const patchStart = now + 100; const pollStart = now + 110; now += 120;
    let pending = waitFor('game-entrance');
    await service.observeGame({ gameName: 'PlateUp!', observedAtMs: patchStart, confirmedAtMs: now, source: 'discord-category' }); await pending;
    const received = []; socket.on('message', raw => received.push(JSON.parse(raw))); now += 10;
    await observeGame('Minecraft', pollStart); expect(service.getStatus().state.game.displayName).toBe('PlateUp!');
    expect(received).toEqual([]);
    pending = waitFor('game-entrance'); await observeGame('Raft', now); await pending;
    expect(service.getStatus().state.game.displayName).toBe('Raft'); expect(received.filter(value => value.type === 'game-entrance')).toHaveLength(1);
});
