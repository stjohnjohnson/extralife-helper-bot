const http = require('node:http');
const { EventEmitter } = require('node:events');
const voice = require('@discordjs/voice');
jest.mock('@discordjs/voice', () => ({
    joinVoiceChannel: jest.fn(), entersState: jest.fn(),
    VoiceConnectionStatus: { Ready: 'ready', Disconnected: 'disconnected', Destroyed: 'destroyed' },
    VoiceConnectionDisconnectReason: { Manual: 3 }
}));
jest.mock('../src/voiceOverlay/server', () => ({
    startOverlayServer: jest.fn(jest.requireActual('../src/voiceOverlay/server').startOverlayServer)
}));
const { startOverlayServer } = require('../src/voiceOverlay/server');
const { startVoiceOverlay } = require('../src/voiceOverlay');

function request(port, path) {
    return new Promise((resolve, reject) => {
        const req = http.get({ hostname: '127.0.0.1', port, path }, res => {
            res.once('data', data => { resolve({ status: res.statusCode, body: data.toString() }); req.destroy(); });
        });
        req.on('error', reject);
    });
}
function snapshot(response) {
    return JSON.parse(response.body.split('data: ')[1].split('\n')[0]);
}
beforeEach(() => {
    jest.clearAllMocks();
    voice.entersState.mockImplementation(async connection => connection);
    voice.joinVoiceChannel.mockImplementation(() => {
        const connection = new EventEmitter();
        connection.state = { status: 'ready' };
        connection.receiver = { speaking: new EventEmitter() };
        connection.destroy = jest.fn(() => { connection.state = { status: 'destroyed' }; });
        return connection;
    });
});

test('the real OBS endpoint starts idle, stays blank while absent, and survives voice join/leave cycles', async () => {
    const client = new EventEmitter(); client.user = { id: 'helper' };
    const guild = { id: 'guild', voiceStates: { cache: new Map() }, voiceAdapterCreator: {} };
    const channel = { id: 'live', guild, isVoiceBased: () => true, permissionsFor: () => ({ has: () => true }),
        members: new Map([['guest', { displayAvatarURL: () => 'https://cdn.discordapp.com/guest.png' }]]) };
    client.channels = { fetch: async () => channel };
    const config = { voiceOverlay: { enabled: true, host: '127.0.0.1', port: 0 },
        discord: { liveRoomChannel: 'live' }, gameUpdates: { userId: 'target' } };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const service = await startVoiceOverlay({ client, config, logger });
    const { address: { port } } = await startOverlayServer.mock.results[0].value;
    const move = channelId => {
        const oldState = guild.voiceStates.cache.get('target') || { id: 'target', guild, channelId: null };
        const next = { id: 'target', guild, channelId };
        guild.voiceStates.cache.set('target', next);
        client.emit('voiceStateUpdate', oldState, next);
    };
    try {
        expect(voice.joinVoiceChannel).not.toHaveBeenCalled();
        expect((await request(port, '/voice')).status).toBe(200);
        expect(snapshot(await request(port, '/voice/events'))).toMatchObject({ ready: false, members: [] });
        for (let cycle = 0; cycle < 2; cycle++) {
            move('live');
            expect(snapshot(await request(port, '/voice/events'))).toMatchObject({ ready: true, members: [{ id: 'guest' }] });
            const connection = voice.joinVoiceChannel.mock.results[cycle].value;
            move(null);
            expect(connection.destroy).toHaveBeenCalledTimes(1);
            expect(snapshot(await request(port, '/voice/events'))).toMatchObject({ ready: false, members: [] });
            expect((await request(port, '/voice')).status).toBe(200);
        }
    } finally { await service.stop(); }
    expect(client.listenerCount('voiceStateUpdate')).toBe(0);
    expect(client.listenerCount('guildAvailable')).toBe(0);
    await expect(request(port, '/voice')).rejects.toMatchObject({ code: 'ECONNREFUSED' });
});
