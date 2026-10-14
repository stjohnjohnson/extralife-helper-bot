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
    service = await startStreamAvatars({ webServer, config: { participantId: '123', twitch: { channel: 'streamer' }, streamAvatars: { config: {
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
    const upgraded = waitFor('snapshot');
    socket.send(JSON.stringify({ version: 3, type: 'ready', capabilities: ['campaign','celebrations','donation-recognition','themes'], resolution: { width: 1920, height: 1080 } }));
    return upgraded;
}
const observeGame = (gameName, at = now, source = 'twitch') => service.observeGame({ gameName, observedAtMs: at, source });
const online = () => service.observeProduction({ status: 'online', observedAtMs: now, startedAtMs: now - 1000, streamId: 'stream' });
test('default production snapshots use the same complete scenery revision as normal packaging', async () => {
    const { catalog } = require('../src/streamAvatars/themeRelease').loadThemePack({
        directory: require('../src/streamAvatars/themeRelease').BUNDLED_THEME_PACK_DIR
    });
    expect(require('../src/streamAvatars/package').buildPackage().imageCount).toBe(54);
    await online(); await connectThemes();
    const pending = waitFor('snapshot', value => value.theme?.gameName === 'Minecraft');
    await observeGame('Minecraft');
    const snapshot = await pending;
    expect(snapshot.theme.packRevision).toBe(catalog.packRevision);
    expect(snapshot.theme.themeId).toBe('block-world');
    expect(catalog.themes[snapshot.theme.themeId].backdrop).toBeTruthy();
    expect(catalog.themes[snapshot.theme.themeId].props).toHaveLength(4);
});
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
test('game updates do not require fresh online evidence', async () => {
    await observeGame('Minecraft', now, 'discord-category'); expect(service.getStatus().game.displayName).toBe('Minecraft');
    now++;
    await service.observeProduction({ status: 'offline', observedAtMs: now });
    await observeGame('Raft'); expect(service.getStatus().game.displayName).toBe('Raft');
    now++; await online(); await observeGame('Minecraft');
    now += 120001; await observeGame('Raft'); expect(service.getStatus().game.displayName).toBe('Raft');
    await service.observeProduction({ status: 'offline', observedAtMs: now }); now++;
    await observeGame('PlateUp!', now, 'discord-category'); expect(service.getStatus().game.displayName).toBe('PlateUp!');
});

test('offline Discord categories reach the companion and persist without creating a broadcast session', async () => {
    await connectThemes();
    let pending = waitFor('snapshot', value => value.theme?.gameName === 'Minecraft');
    await service.observeGame({ gameName: 'Minecraft', observedAtMs: now - 10, confirmedAtMs: now, source: 'discord-category' });
    expect(await pending).toMatchObject({ theme: { themeId: 'block-world' } });
    let durable = JSON.parse(await fs.readFile(join(directory, 'production/state.json'), 'utf8'));
    expect(durable).toMatchObject({ sessionId: null, game: { displayName: 'Minecraft', observedAtMs: now } });
    now++;
    pending = waitFor('game-entrance');
    await observeGame('PlateUp!', now, 'discord-category');
    expect(await pending).toMatchObject({ themeId: 'kitchen' });
    now++;
    await observeGame('Minecraft', now - 2, 'discord-category');
    expect(service.getStatus().game.displayName).toBe('PlateUp!');
    await service.observeProduction({ status: 'offline', observedAtMs: now });
    durable = JSON.parse(await fs.readFile(join(directory, 'production/state.json'), 'utf8'));
    expect(durable).toMatchObject({ sessionId: null, game: { displayName: 'PlateUp!' } });
});

test('offline scenery survives restart and live startup reconciles silently', async () => {
    await observeGame('Minecraft', now, 'discord-category');
    await service.stop();
    service = await startStreamAvatars({ webServer, config: { participantId: '123', twitch: { channel: 'streamer' }, streamAvatars: { config: { token: 't'.repeat(32), stateDir: directory } } }, logger: { warn() {} }, realClock: { nowMs: () => now } });
    const restored = await connectThemes();
    expect(restored.theme).toMatchObject({ gameName: 'Minecraft', themeId: 'block-world' });
    const received = []; socket.on('message', raw => received.push(JSON.parse(raw)));
    now++; await online();
    expect(service.getStatus().game.displayName).toBe('Minecraft');
    await observeGame('PlateUp!', now - 1);
    expect(service.getStatus().game.displayName).toBe('Minecraft');
    const pending = waitFor('snapshot', value => value.theme?.gameName === 'Raft');
    await observeGame('Raft'); await pending;
    expect(received.every(value => value.type === 'snapshot')).toBe(true);
    expect(service.getStatus().game.displayName).toBe('Raft');
});

test('offline grace ends the broadcast without clearing scenery or blocking later Discord updates', async () => {
    await online(); await observeGame('Minecraft');
    now++; await service.observeProduction({ status: 'offline', observedAtMs: now });
    for (let i = 0; i < 15; i++) {
        now += 60000; await service.observeProduction({ status: 'offline', observedAtMs: now });
    }
    expect(service.getStatus().game.displayName).toBe('Minecraft');
    now++; await observeGame('PlateUp!', now, 'discord-category');
    expect(service.getStatus().game.displayName).toBe('PlateUp!');
    const durable = JSON.parse(await fs.readFile(join(directory, 'production/state.json'), 'utf8'));
    expect(durable.endedAtMs).not.toBeNull();
});
test('restart and reconnect restore latest game with no entrance; first reconciliation stays quiet', async () => {
    await online(); await observeGame('Minecraft'); now++; await observeGame('Raft');
    await service.stop();
    service = await startStreamAvatars({ webServer, config: { participantId: '123', twitch: { channel: 'streamer' }, streamAvatars: { config: { token: 't'.repeat(32), stateDir: directory, graceMs: 900000 } } }, logger: { warn() {} }, realClock: { nowMs: () => now } });
    await connectThemes(); const received = []; socket.on('message', raw => received.push(JSON.parse(raw))); now++;
    await online(); const pending = waitFor('snapshot', value => value.theme?.gameName === 'PlateUp!'); await observeGame('PlateUp!'); await pending;
    expect(received.every(value => ['snapshot', 'clear'].includes(value.type))).toBe(true);
});
test('disconnected transitions restore a negotiated snapshot without replay; campaign reset retains game', async () => {
    await online(); await observeGame('Minecraft'); now++; await observeGame('Raft');
    const snapshot = await connectThemes();
    expect(snapshot.theme).toMatchObject({ gameName: 'Raft', themeId: 'outdoor' });
    const received = []; socket.on('message', raw => received.push(JSON.parse(raw)));
    const pending = waitFor('snapshot', value => value.theme?.gameName === 'Raft');
    expect((await service.dispatch({ name: 'campaign.reset' })).status).toBe('ok'); await pending;
    expect(service.getStatus().game.displayName).toBe('Raft'); expect(received.some(value => value.type === 'game-entrance')).toBe(false);
});
test('invalid theme configuration keeps independent campaign donations available', async () => {
    await service.stop();
    service = await startStreamAvatars({ webServer, config: { participantId: '123', twitch: { channel: 'streamer' }, streamAvatars: { config: { token: 't'.repeat(32), stateDir: directory, themes: { enabled: false, config: null, errors: ['Invalid Stream Avatars theme configuration'] } } } }, logger: { warn() {} }, realClock: { nowMs: () => now } });
    await online(); await connectThemes(); await observeGame('Minecraft'); expect(service.getStatus().game).toBeNull();
    const accept = donations => service.acceptObservation({ expectedEpochId: service.getPollCheckpoint().epochId, batchId: 'gift', complete: true, donations, observedAtMs: now });
    await accept([]); now++;
    const pending = waitFor('celebration'); await accept([{ id: 'gift', participantId: '123', createdAtMs: now, amountCents: 2500 }]);
    expect(await pending).toMatchObject({ phase: 'recognition', donationTotalCents: 2500 });
});
test('campaign reset and queued live game observations retain independent ownership', async () => {
    await service.observeProduction({ status: 'offline', observedAtMs: now }); now++;
    const becomingLive = online(); const reset = service.dispatch({ name: 'campaign.reset' }); await becomingLive;
    expect((await reset).status).toBe('ok'); await observeGame('Minecraft');
    expect(service.getStatus().game.displayName).toBe('Minecraft'); expect(service.getStatus().campaignTotalCents).toBeNull();
});
test('an overlapping old Twitch read cannot undo a completed category write or emit another entrance', async () => {
    await online(); await observeGame('Minecraft'); await connectThemes();
    const patchStart = now + 100; const pollStart = now + 110; now += 120;
    let pending = waitFor('game-entrance');
    await service.observeGame({ gameName: 'PlateUp!', observedAtMs: patchStart, confirmedAtMs: now, source: 'discord-category' }); await pending;
    const received = []; socket.on('message', raw => received.push(JSON.parse(raw))); now += 10;
    await observeGame('Minecraft', pollStart); expect(service.getStatus().game.displayName).toBe('PlateUp!');
    expect(received).toEqual([]);
    pending = waitFor('game-entrance'); await observeGame('Raft', now); await pending;
    expect(service.getStatus().game.displayName).toBe('Raft'); expect(received.filter(value => value.type === 'game-entrance')).toHaveLength(1);
});

test('an old in-flight game read cannot replace a newer online status after offline', async () => {
    await online(); await observeGame('Minecraft');
    now += 100; await service.observeProduction({ status: 'offline', observedAtMs: now });
    now += 100; await online();
    await observeGame('Raft', now - 150);
    expect(service.getStatus().game.displayName).toBe('Minecraft');
});

test.each([
    ['game.reset', 'twitch'], ['game.recover', 'twitch'],
    ['game.reset', 'discord-category'], ['game.recover', 'discord-category']
])('%s fences older %s updates after changing stored observation history', async (action, source) => {
    await observeGame('Minecraft', now, 'discord-category');
    now += 10; await observeGame('PlateUp!', now, 'discord-category');
    now += 100; await service.observeProduction({ status: 'offline', observedAtMs: now });
    expect((await service.dispatch({ name: action })).status).toBe('ok');
    const restored = service.getStatus().game;
    const durable = await fs.readFile(join(directory, 'production/state.json'), 'utf8');
    await service.observeGame({ gameName: 'Raft', observedAtMs: now - 50, source,
        ...(source === 'discord-category' ? { confirmedAtMs: now - 1 } : {}) });
    expect(service.getStatus().game).toEqual(restored);
    expect(await fs.readFile(join(directory, 'production/state.json'), 'utf8')).toBe(durable);
    now++; await observeGame('Raft', now, 'discord-category');
    expect(service.getStatus().game.displayName).toBe('Raft');
});

test('confirmed game reset and recovery require fresh offline evidence and leave campaign and donation effects intact', async () => {
    await online(); await observeGame('Minecraft');
    expect((await service.dispatch({ name: 'game.reset' })).status).toBe('denied');
    await connectThemes();
    const accept = donations => service.acceptObservation({ expectedEpochId: service.getPollCheckpoint().epochId, batchId: 'game-recovery', complete: true, donations, observedAtMs: now });
    await accept([]); now++;
    let pending = waitFor('celebration');
    await accept([{ id: 'gift', participantId: '123', createdAtMs: now, amountCents: 2500 }]); await pending;
    now++; await service.observeProduction({ status: 'offline', observedAtMs: now });
    const before = await fs.readFile(join(directory, 'production/campaign.json'), 'utf8');
    const checkpoint = service.getPollCheckpoint(); const received = [];
    socket.on('message', raw => received.push(JSON.parse(raw)));
    pending = waitFor('snapshot', value => value.theme === null);
    expect((await service.dispatch({ name: 'game.reset' })).status).toBe('ok'); await pending;
    expect(service.getStatus().game).toBeNull();
    pending = waitFor('snapshot', value => value.theme?.gameName === 'Minecraft');
    expect((await service.dispatch({ name: 'game.recover' })).status).toBe('ok'); await pending;
    expect(service.getStatus().game.displayName).toBe('Minecraft');
    expect(await fs.readFile(join(directory, 'production/campaign.json'), 'utf8')).toBe(before);
    expect(service.getPollCheckpoint()).toEqual(checkpoint);
    expect(received.every(value => value.type === 'snapshot')).toBe(true);
    expect(new Set(received.map(value => value.generation)).size).toBe(1);
    now += 120001;
    expect((await service.dispatch({ name: 'game.recover' })).status).toBe('denied');
});

test('a corrupt game file keeps campaign accounting available and can recover after fresh offline confirmation', async () => {
    await online(); await observeGame('Minecraft'); now++; await observeGame('Raft');
    await service.stop(); await fs.writeFile(join(directory, 'production/state.json'), '{broken');
    service = await startStreamAvatars({ webServer, config: { participantId: '123', twitch: { channel: 'streamer' }, streamAvatars: { config: { token: 't'.repeat(32), stateDir: directory } } }, logger: { warn() {} }, realClock: { nowMs: () => now } });
    expect(service.getStatus().gameRecoveryRequired).toBe(true);
    await service.acceptObservation({ expectedEpochId: service.getPollCheckpoint().epochId, batchId: 'baseline', observedAtMs: now, campaign: { observedAtMs: now, totalCents: 90000, goalCents: 100000 } });
    now++; await service.observeProduction({ status: 'offline', observedAtMs: now });
    expect((await service.dispatch({ name: 'game.recover' })).status).toBe('ok');
    expect(service.getStatus()).toMatchObject({ gameRecoveryRequired: false, game: { displayName: 'Minecraft' }, campaignTotalCents: 90000 });
});

test.each([['Minecraft', 'kitchen'], ['Unmapped Adventure', 'puzzle']])('restart reconciles %s mapping without entrances or campaign mutation', async (gameName, themeId) => {
    await online(); await observeGame(gameName);
    await service.acceptObservation({ expectedEpochId: service.getPollCheckpoint().epochId, batchId: 'baseline', observedAtMs: now, campaign: { observedAtMs: now, totalCents: 90000, goalCents: 100000 } });
    await service.stop();
    const before = await fs.readFile(join(directory, 'production/campaign.json'), 'utf8');
    const themes = require('../src/streamAvatars/themes').loadThemeConfiguration({ defaults: { games: { [gameName]: themeId } } });
    service = await startStreamAvatars({ webServer, config: { participantId: '123', twitch: { channel: 'streamer' }, streamAvatars: { config: { token: 't'.repeat(32), stateDir: directory, themes } } }, logger: { warn() {} }, realClock: { nowMs: () => now } });
    await connectThemes(); const received = []; socket.on('message', raw => received.push(JSON.parse(raw)));
    const checkpoint = service.getPollCheckpoint(); now++; await online(); await observeGame(gameName);
    expect(service.getStatus().game).toMatchObject({ displayName: gameName, themeId });
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(received.some(value => value.type === 'snapshot' && value.theme?.themeId === themeId)).toBe(true);
    expect(received.some(value => value.type === 'game-entrance')).toBe(false);
    expect(await fs.readFile(join(directory, 'production/campaign.json'), 'utf8')).toBe(before);
    expect(service.getPollCheckpoint()).toEqual(checkpoint);
});
