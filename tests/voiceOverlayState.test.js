const { EventEmitter } = require('node:events');
const { createOverlayState } = require('../src/voiceOverlay/state');
function setup() {
    const client = new EventEmitter(); client.user = { id: 'helper' };
    const guild = { id: 'guild', voiceStates: { cache: new Map() } };
    const member = id => ({ id, user: { bot: id === 'bot' }, displayAvatarURL: () => `https://cdn.discordapp.com/avatars/${id}/a.png` });
    const channel = { id: 'live', guild, members: new Map(['target', 'helper', 'bot', '900719925474099312'].map(id => [id, member(id)])) };
    const state = createOverlayState({ client, channel, excludedUserId: 'target' });
    const change = id => client.emit('voiceStateUpdate', { guild, id, channelId: 'live' }, { guild, id, channelId: 'live' });
    return { client, channel, state, member, change };
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
test('fixed roster excludes target/helper, retains other bots and string IDs, and hides unavailable state', () => {
    const s = setup();
    expect(s.state.getSnapshot()).toMatchObject({ ready: false, members: [] });
    s.state.setReady(true);
    expect(s.state.getSnapshot().members.map(m => m.id)).toEqual(['900719925474099312', 'bot']);
    s.state.stop();
});
test('new members append, avatar changes keep slots, unrelated rooms do not affect order', () => {
    const s = setup(); s.state.setReady(true);
    s.channel.members.set('alice', s.member('alice')); s.change('alice');
    expect(s.state.getSnapshot().members.map(m => m.id)).toEqual(['900719925474099312', 'bot', 'alice']);
    s.channel.members.get('alice').displayAvatarURL = () => 'https://cdn.discordapp.com/new.png';
    s.client.emit('guildMemberUpdate', null, { id: 'alice', guild: s.channel.guild });
    expect(s.state.getSnapshot().members.at(-1).avatarUrl).toBe('https://cdn.discordapp.com/new.png');
    const revision = s.state.getSnapshot().revision;
    s.client.emit('voiceStateUpdate', { guild: { id: 'other' } }, { guild: { id: 'other' } });
    expect(s.state.getSnapshot().revision).toBe(revision);
    s.state.stop();
});
test('simultaneous speakers have delayed release cancelled by new speech', () => {
    const s = setup(); s.state.setReady(true);
    s.state.setSpeaking('bot', true); s.state.setSpeaking('900719925474099312', true);
    expect(s.state.getSnapshot().members.every(m => m.speaking)).toBe(true);
    s.state.setSpeaking('bot', false); jest.advanceTimersByTime(179);
    expect(s.state.getSnapshot().members.find(m => m.id === 'bot').speaking).toBe(true);
    s.state.setSpeaking('bot', true); jest.advanceTimersByTime(1);
    expect(s.state.getSnapshot().members.find(m => m.id === 'bot').speaking).toBe(true);
    s.state.setSpeaking('bot', false); jest.advanceTimersByTime(180);
    expect(s.state.getSnapshot().members.find(m => m.id === 'bot').speaking).toBe(false);
    s.state.setSpeaking('target', true); s.state.setSpeaking('unknown', true);
    s.state.stop();
});
test('mute, leave, and unavailability clear highlights and pending timers', () => {
    const s = setup(); s.state.setReady(true); s.state.setSpeaking('bot', true);
    s.channel.guild.voiceStates.cache.set('bot', { mute: true }); s.change('bot');
    expect(s.state.getSnapshot().members.find(m => m.id === 'bot').speaking).toBe(false);
    s.state.setSpeaking('bot', true);
    expect(s.state.getSnapshot().members.find(m => m.id === 'bot').speaking).toBe(false);
    s.channel.members.delete('bot'); s.change('bot');
    expect(s.state.getSnapshot().members).toHaveLength(1);
    s.state.setSpeaking('900719925474099312', true); s.state.setSpeaking('900719925474099312', false);
    s.state.setReady(false); jest.advanceTimersByTime(180); s.state.setReady(true);
    expect(s.state.getSnapshot().members[0].speaking).toBe(false);
    s.state.stop();
});
test('snapshots are isolated and unsubscribed/stopped listeners receive no late updates', () => {
    const s = setup(); const updates = [];
    const unsubscribe = s.state.subscribe(snapshot => updates.push(snapshot));
    s.state.setReady(true); const snapshot = s.state.getSnapshot(); snapshot.members.pop();
    expect(s.state.getSnapshot().members).toHaveLength(2);
    unsubscribe(); s.state.setSpeaking('bot', true);
    expect(updates).toHaveLength(1);
    s.state.stop(); s.state.setReady(true); s.change('bot');
    expect(s.client.listenerCount('voiceStateUpdate')).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
});
