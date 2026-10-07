const { EventEmitter } = require('node:events');
const { createOverlayState } = require('../src/voiceOverlay/state');
const voice = require('@discordjs/voice');
jest.mock('@discordjs/voice', () => ({
    joinVoiceChannel: jest.fn(), entersState: jest.fn(),
    VoiceConnectionStatus: { Ready: 'ready', Disconnected: 'disconnected', Destroyed: 'destroyed', Signalling: 'signalling', Connecting: 'connecting' },
    VoiceConnectionDisconnectReason: { WebSocketClose: 0, Manual: 3 }
}));
const { startOverlayConnection } = require('../src/voiceOverlay/connection');
function setup() {
    const client = new EventEmitter(); client.user = { id: 'helper' };
    const channel = { id: 'live', guild: { id: 'guild', voiceAdapterCreator: {}, voiceStates: { cache: new Map() } },
        members: new Map([['guest', { displayAvatarURL: () => 'https://cdn.discordapp.com/guest.png' }]]) };
    const state = createOverlayState({ client, channel, excludedUserId: 'target' });
    const connection = new EventEmitter();
    connection.state = { status: 'ready' }; connection.receiver = { speaking: new EventEmitter() };
    connection.rejoin = jest.fn(() => true); connection.destroy = jest.fn(() => { connection.state = { status: 'destroyed' }; });
    voice.joinVoiceChannel.mockReturnValue(connection); voice.entersState.mockResolvedValue(connection);
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const controller = startOverlayConnection({ client, channel, state, logger });
    return { client, channel, state, connection, controller, logger };
}
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => jest.useRealTimers());
test('joins muted/not deafened and forwards receiver speech to actual state', async () => {
    const s = setup(); await s.controller.ready;
    expect(voice.joinVoiceChannel).toHaveBeenCalledWith(expect.objectContaining({ channelId: 'live', selfMute: true, selfDeaf: false }));
    s.connection.receiver.speaking.emit('start', 'guest');
    expect(s.state.getSnapshot().members[0].speaking).toBe(true);
    s.connection.receiver.speaking.emit('end', 'guest'); jest.advanceTimersByTime(180);
    expect(s.state.getSnapshot().members[0].speaking).toBe(false);
    await s.controller.stop(); s.state.stop();
    expect(s.connection.receiver.speaking.listenerCount('start')).toBe(0);
});
test('transient failures clear state and retry with capped backoff, then recover', async () => {
    const s = setup(); await s.controller.ready;
    voice.entersState.mockRejectedValue(new Error('offline'));
    s.connection.state = { status: 'disconnected', reason: 0, closeCode: 1006 };
    s.connection.emit('stateChange', { status: 'ready' }, s.connection.state);
    expect(s.state.getSnapshot().ready).toBe(false);
    for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
        const calls = s.connection.rejoin.mock.calls.length;
        await jest.advanceTimersByTimeAsync(delay - 1); expect(s.connection.rejoin).toHaveBeenCalledTimes(calls);
        await jest.advanceTimersByTimeAsync(1); expect(s.connection.rejoin).toHaveBeenCalledTimes(calls + 1);
    }
    voice.entersState.mockResolvedValue(s.connection);
    s.connection.state = { status: 'ready' }; s.connection.emit('stateChange', { status: 'disconnected' }, s.connection.state);
    expect(s.state.getSnapshot().ready).toBe(true);
    await s.controller.stop(); s.state.stop(); expect(jest.getTimerCount()).toBe(0);
});
test.each([null, 'different-room'])('administrator move/disconnect to %s pauses automatic return', async channelId => {
    const s = setup(); await s.controller.ready;
    s.client.emit('voiceStateUpdate', { id: 'helper', guild: s.channel.guild, channelId: 'live' }, { id: 'helper', guild: s.channel.guild, channelId });
    await jest.advanceTimersByTimeAsync(60000);
    expect(s.state.getSnapshot()).toMatchObject({ ready: false, members: [] });
    expect(s.connection.rejoin).not.toHaveBeenCalled();
    await s.controller.stop(); s.state.stop();
});
test('4014/manual disconnect pauses, while helper server-deaf state hides the row', async () => {
    const s = setup(); await s.controller.ready;
    s.client.emit('voiceStateUpdate', { id: 'helper', guild: s.channel.guild, channelId: 'live' }, { id: 'helper', guild: s.channel.guild, channelId: 'live', serverDeaf: true });
    expect(s.state.getSnapshot().ready).toBe(false);
    s.client.emit('voiceStateUpdate', { id: 'helper', guild: s.channel.guild, channelId: 'live' }, { id: 'helper', guild: s.channel.guild, channelId: 'live', serverDeaf: false });
    expect(s.state.getSnapshot().ready).toBe(true);
    s.connection.emit('stateChange', { status: 'ready' }, { status: 'disconnected', reason: 0, closeCode: 4014 });
    await jest.advanceTimersByTimeAsync(60000); expect(s.connection.rejoin).not.toHaveBeenCalled();
    await s.controller.stop(); s.state.stop();
});
test('initial failure and stop during startup clean up without late readiness', async () => {
    voice.entersState.mockRejectedValueOnce(new Error('timeout'));
    const s = setup();
    // setup installs the normal default; explicitly reject the pending ready wait.
    await expect(s.controller.ready).rejects.toThrow('timeout');
    expect(s.state.getSnapshot().ready).toBe(false); expect(s.connection.destroy).toHaveBeenCalled();
    await s.controller.stop(); s.state.stop();
});
test('stop aborts pending readiness and ignores late events', async () => {
    const s = setup(); await s.controller.stop(); await s.controller.ready.catch(() => {});
    s.connection.emit('stateChange', { status: 'disconnected' }, { status: 'ready' });
    expect(s.state.getSnapshot().ready).toBe(false);
    expect(s.client.listenerCount('voiceStateUpdate')).toBe(1); // only roster state remains
    s.state.stop(); expect(jest.getTimerCount()).toBe(0);
});


test('gateway destruction recreates the connection and detaches the old receiver', async () => {
    const s = setup(); await s.controller.ready;
    const replacement = new EventEmitter();
    replacement.state = { status: 'ready' };
    replacement.receiver = { speaking: new EventEmitter() };
    replacement.rejoin = jest.fn(() => true);
    replacement.destroy = jest.fn(() => { replacement.state = { status: 'destroyed' }; });
    voice.joinVoiceChannel.mockReturnValue(replacement);
    voice.entersState.mockResolvedValue(replacement);
    s.connection.state = { status: 'destroyed' };
    s.connection.emit('stateChange', { status: 'ready' }, s.connection.state);
    expect(s.state.getSnapshot().ready).toBe(false);
    await jest.advanceTimersByTimeAsync(1000);
    expect(voice.joinVoiceChannel).toHaveBeenCalledTimes(2);
    expect(s.connection.receiver.speaking.listenerCount('start')).toBe(0);
    expect(s.state.getSnapshot().ready).toBe(true);
    replacement.receiver.speaking.emit('start', 'guest');
    expect(s.state.getSnapshot().members[0].speaking).toBe(true);
    await s.controller.stop(); s.state.stop();
    expect(replacement.receiver.speaking.listenerCount('start')).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
});

test('guild unavailability clears the roster until the guild becomes available', async () => {
    const s = setup(); await s.controller.ready;
    s.connection.receiver.speaking.emit('start', 'guest');
    s.client.emit('guildUnavailable', { id: 'other-guild' });
    expect(s.state.getSnapshot().ready).toBe(true);
    s.client.emit('guildUnavailable', s.channel.guild);
    expect(s.state.getSnapshot()).toMatchObject({ ready: false, members: [] });
    await jest.advanceTimersByTimeAsync(30000);
    s.client.emit('guildAvailable', s.channel.guild);
    expect(s.state.getSnapshot()).toMatchObject({ ready: true, members: [{ id: 'guest', speaking: false }] });
    await s.controller.stop(); s.state.stop();
    expect(s.client.listenerCount('guildUnavailable')).toBe(0);
    expect(s.client.listenerCount('guildAvailable')).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
});

test.each(['signalling', 'connecting'])('a stalled %s transition has a bounded recovery wait', async status => {
    const s = setup(); await s.controller.ready;
    s.connection.state = { status };
    s.connection.emit('stateChange', { status: 'ready' }, s.connection.state);
    expect(s.state.getSnapshot().ready).toBe(false);
    await jest.advanceTimersByTimeAsync(20999);
    expect(s.connection.rejoin).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(s.connection.rejoin).toHaveBeenCalledTimes(1);
    s.connection.state = { status: 'ready' };
    s.connection.emit('stateChange', { status }, s.connection.state);
    expect(s.state.getSnapshot().ready).toBe(true);
    await s.controller.stop(); s.state.stop();
    expect(jest.getTimerCount()).toBe(0);
});
