const { EventEmitter } = require('node:events');
const { startVoiceOverlay } = require('../src/voiceOverlay');
const { startOverlayConnection } = require('../src/voiceOverlay/connection');
jest.mock('../src/voiceOverlay/connection', () => ({ startOverlayConnection: jest.fn() }));
function setup() {
    const client = new EventEmitter(); client.user = { id: 'helper' };
    const channel = { id: 'live', isVoiceBased: () => true, guild: { id: 'guild', voiceStates: { cache: new Map() } }, members: new Map(),
        permissionsFor: () => ({ has: () => true }) };
    client.channels = { fetch: jest.fn().mockResolvedValue(channel) };
    const controller = { ready: Promise.resolve(), stop: jest.fn().mockResolvedValue() };
    startOverlayConnection.mockReturnValue(controller);
    return { client, channel, controller, config: { voiceOverlay: { enabled: true, host: '127.0.0.1', port: 0 }, discord: { liveRoomChannel: 'live' }, gameUpdates: { userId: 'target' } },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } };
}
beforeEach(() => jest.clearAllMocks());
test('disabled feature creates no connection or channel access', async () => {
    const s = setup(); s.config.voiceOverlay.enabled = false;
    const service = await startVoiceOverlay(s); await service.stop();
    expect(s.client.channels.fetch).not.toHaveBeenCalled(); expect(startOverlayConnection).not.toHaveBeenCalled();
});
test('enabled service resolves fixed room and owns idempotent shutdown', async () => {
    const s = setup(); const service = await startVoiceOverlay(s);
    try {
        expect(s.client.channels.fetch).toHaveBeenCalledWith('live');
        expect(startOverlayConnection).toHaveBeenCalledWith(expect.objectContaining({ channel: s.channel, streamerUserId: 'target' }));
    } finally { await service.stop(); }
    await service.stop();
    expect(s.controller.stop).toHaveBeenCalledTimes(1); expect(s.client.listenerCount('voiceStateUpdate')).toBe(0);
});
test.each(['channel', 'permissions', 'voice'])('failed %s startup cleans up', async type => {
    const s = setup();
    if (type === 'channel') s.channel.isVoiceBased = () => false;
    if (type === 'permissions') s.channel.permissionsFor = () => ({ has: () => false });
    if (type === 'voice') startOverlayConnection.mockImplementation(() => ({ ...s.controller, ready: Promise.reject(new Error('timeout')) }));
    await expect(startVoiceOverlay(s)).rejects.toThrow();
    expect(s.client.listenerCount('voiceStateUpdate')).toBe(0);
});
test('abort during readiness closes partial resources and rejects late success', async () => {
    const s = setup(); const abort = new AbortController(); let finish;
    s.controller.ready = new Promise(resolve => { finish = resolve; });
    const starting = startVoiceOverlay({ ...s, signal: abort.signal });
    await new Promise(resolve => startOverlayConnection.mockImplementation(() => { resolve(); return s.controller; }));
    abort.abort(); finish();
    await expect(starting).rejects.toThrow();
    expect(s.controller.stop).toHaveBeenCalled(); expect(s.client.listenerCount('voiceStateUpdate')).toBe(0);
});


test('failed voice readiness removes voice routes while preserving the application listener', async () => {
    const http = require('node:http'); const { startWebServer } = require('../src/webServer');
    const webServer = await startWebServer({ config: { host: '127.0.0.1', port: 0 } });
    webServer.registerHttp(['/other'], (req, res) => { res.end('available'); });
    const s = setup(); let begun; let fail;
    const connected = new Promise(resolve => { begun = resolve; });
    s.controller.ready = new Promise((resolve, reject) => { fail = reject; });
    startOverlayConnection.mockImplementation(() => { begun(); return s.controller; });
    const starting = startVoiceOverlay({ ...s, webServer });
    const request = path => new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port: webServer.address.port, path }, res => {
            res.resume(); res.once('end', () => resolve(res.statusCode));
        }); req.on('error', reject);
    });
    try {
        await connected; expect(await request('/voice')).toBe(200);
        const rejected = expect(starting).rejects.toThrow('voice unavailable');
        fail(new Error('voice unavailable')); await rejected;
        expect(await request('/voice')).toBe(404); expect(await request('/other')).toBe(200);
        expect(s.client.listenerCount('voiceStateUpdate')).toBe(0);
    } finally { fail(new Error('cleanup')); await starting.catch(() => {}); await webServer.stop(); }
});
