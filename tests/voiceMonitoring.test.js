const { EventEmitter } = require('events');
const { startVoiceMonitoring, stopVoiceMonitoring } = require('../src/voiceMonitoring');
function setup() {
    const client = new EventEmitter();
    const members = new Map([['streamer', { user: { bot: false } }], ['human', { user: { bot: false } }], ['bot', { user: { bot: true } }]]);
    const guild = { id: 'guild', available: true, voiceStates: { cache: new Map([['streamer', { channelId: 'voice' }]]) }, channels: { cache: new Map([['voice', { members }]]) } };
    const logger = { info: jest.fn(), error: jest.fn() };
    const config = { gameUpdates: { userId: 'streamer' }, discord: { voiceSampleIntervalSeconds: 60 } };
    return { client, guild, logger, config };
}
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(0); });
afterEach(() => jest.useRealTimers());
test('counts humans and bots, periodically samples unchanged counts, and cleans up', async () => {
    const s = setup(); const monitor = startVoiceMonitoring(s.client, s.guild, s.config, s.logger);
    await Promise.resolve();
    expect(s.logger.info.mock.calls[0][1]).toMatchObject({ trigger: 'startup', humanCount: 2, companionCount: 1, botCount: 1 });
    expect(JSON.stringify(s.logger.info.mock.calls)).not.toContain('streamer"');
    jest.advanceTimersByTime(60000);
    await Promise.resolve();
    expect(s.logger.info.mock.calls.at(-1)[1].trigger).toBe('periodic');
    stopVoiceMonitoring(monitor);
    expect(s.client.listenerCount('voiceStateUpdate')).toBe(0);
    jest.advanceTimersByTime(60000);
    expect(s.logger.info).toHaveBeenCalledTimes(2);
});
test('follows moves and disconnects while ignoring unrelated and mute-only changes', async () => {
    const s = setup(); const monitor = startVoiceMonitoring(s.client, s.guild, s.config, s.logger);
    s.client.emit('voiceStateUpdate', { guild: s.guild, channelId: 'other' }, { guild: s.guild, channelId: 'other' });
    s.client.emit('voiceStateUpdate', { guild: s.guild, channelId: 'voice' }, { guild: s.guild, channelId: 'voice' });
    await Promise.resolve();
    expect(s.logger.info).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    s.guild.voiceStates.cache.set('streamer', { channelId: null });
    s.client.emit('voiceStateUpdate', { guild: s.guild, id: 'streamer', channelId: 'voice' }, { guild: s.guild, id: 'streamer', channelId: null });
    await Promise.resolve();
    expect(s.logger.info.mock.calls.at(-1)[1]).toMatchObject({ streamerPresent: false, companionCount: 0, channelId: null });
    stopVoiceMonitoring(monitor);
});
test('missing channel and unavailable guild are errors without member identities', () => {
    const s = setup(); s.guild.channels.cache.clear();
    const monitor = startVoiceMonitoring(s.client, s.guild, s.config, s.logger);
    expect(s.logger.info).not.toHaveBeenCalled();
    expect(s.logger.error.mock.calls[0][1]).toMatchObject({ eventType: 'service_error', service: 'discord_voice' });
    s.guild.available = false; jest.advanceTimersByTime(60000);
    expect(s.logger.error).toHaveBeenCalledTimes(2);
    stopVoiceMonitoring(monitor);
});
test('startup and periodic collisions emit one periodic observation', async () => {
    const interval = jest.spyOn(global, 'setInterval');
    const s = setup(); const monitor = startVoiceMonitoring(s.client, s.guild, s.config, s.logger);
    interval.mock.calls.at(-1)[0]();
    await Promise.resolve();
    expect(s.logger.info).toHaveBeenCalledTimes(1);
    expect(s.logger.info.mock.calls[0][1].trigger).toBe('periodic');
    stopVoiceMonitoring(monitor); interval.mockRestore();
});
test('moves follow the streamer and collection recovers after unavailable state', async () => {
    const s = setup(); const monitor = startVoiceMonitoring(s.client, s.guild, s.config, s.logger);
    await Promise.resolve();
    s.guild.available = false; jest.advanceTimersByTime(60000);
    s.guild.available = true;
    s.guild.channels.cache.set('next', { members: new Map([['streamer', { user: { bot: false } }]]) });
    s.guild.voiceStates.cache.set('streamer', { channelId: 'next' });
    s.client.emit('voiceStateUpdate', { guild: s.guild, id: 'streamer', channelId: 'voice' }, { guild: s.guild, id: 'streamer', channelId: 'next' });
    await Promise.resolve();
    expect(s.logger.info.mock.calls.at(-1)[1]).toMatchObject({ channelId: 'next', humanCount: 1, companionCount: 0, botCount: 0 });
    stopVoiceMonitoring(monitor);
});
test('shutdown suppresses a queued voice sample', async () => {
    const s = setup(); const monitor = startVoiceMonitoring(s.client, s.guild, s.config, s.logger);
    stopVoiceMonitoring(monitor);
    await Promise.resolve();
    expect(s.logger.info).not.toHaveBeenCalled();
});

test('excludes helper from bot counts while retaining other bots and streamer semantics', async () => {
    const s = setup();
    s.client.user = { id: 'helper' };
    s.guild.channels.cache.get('voice').members.set('helper', { user: { bot: true } });
    const monitor = startVoiceMonitoring(s.client, s.guild, s.config, s.logger);
    await Promise.resolve();
    expect(s.logger.info.mock.calls[0][1]).toMatchObject({ humanCount: 2, companionCount: 1, botCount: 1 });
    stopVoiceMonitoring(monitor);
});
test('helper joins and leaves do not create count changes but periodic samples continue', async () => {
    const s = setup();
    s.client.user = { id: 'helper' };
    const monitor = startVoiceMonitoring(s.client, s.guild, s.config, s.logger);
    await Promise.resolve();
    jest.advanceTimersByTime(1);
    const members = s.guild.channels.cache.get('voice').members;
    members.set('helper', { user: { bot: true } });
    s.client.emit('voiceStateUpdate', { guild: s.guild, id: 'helper', channelId: null }, { guild: s.guild, id: 'helper', channelId: 'voice' });
    await Promise.resolve();
    expect(s.logger.info).toHaveBeenCalledTimes(1);
    members.delete('helper');
    s.client.emit('voiceStateUpdate', { guild: s.guild, id: 'helper', channelId: 'voice' }, { guild: s.guild, id: 'helper', channelId: null });
    await Promise.resolve();
    expect(s.logger.info).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60000);
    await Promise.resolve();
    expect(s.logger.info.mock.calls.at(-1)[1]).toMatchObject({ trigger: 'periodic', botCount: 1 });
    stopVoiceMonitoring(monitor);
});
test('classification still works when helper identity is not yet available', async () => {
    const s = setup(); s.client.user = null;
    const monitor = startVoiceMonitoring(s.client, s.guild, s.config, s.logger);
    await Promise.resolve();
    expect(s.logger.info.mock.calls[0][1].botCount).toBe(1);
    stopVoiceMonitoring(monitor);
});
