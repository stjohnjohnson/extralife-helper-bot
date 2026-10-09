const { createEventDispatcher } = require('../src/streamAvatars/events');
test('hearts stamp real expiry, suppress repeats, and never queue disconnected effects', () => {
    const packets = []; let connected = false; let time = 1000;
    const dispatcher = createEventDispatcher({ realClock: { nowMs: () => time }, send: message => { if (!connected) return false; packets.push(message); return true; }, newEventId: () => 'id' });
    expect(dispatcher.publishHearts({ mode: 'integration', generation: 1, campaignId: 's' })).toBe(false);
    connected = true; time = 2000;
    expect(dispatcher.publishHearts({ mode: 'integration', generation: 1, campaignId: 's' })).toBe(true);
    expect(packets[0]).toMatchObject({ issuedAtMs: 2000, expiresAtMs: 12000, durationMs: 5000 });
    expect(dispatcher.publishHearts({ mode: 'integration', generation: 1, campaignId: 's' })).toBe(false);
    dispatcher.clear({ mode: 'production', generation: 2 }); expect(packets.at(-1).type).toBe('clear');
    dispatcher.stop(); expect(dispatcher.publishHearts({ mode: 'production', generation: 2, campaignId: 's' })).toBe(false);
});
test('game entrances stamp 6s duration and 10s expiry, deduplicate and drop disconnected effects', () => {
    const messages = []; let connected = false;
    const dispatcher = createEventDispatcher({ realClock: { nowMs: () => 2000 }, send: value => { if (!connected) return false; messages.push(value); return true; }, newEventId: () => 'game-event' });
    const args = { mode: 'production', generation: 1, sessionId: 'session', gameIdentity: 'a'.repeat(64), themeId: 'party' };
    expect(dispatcher.publishGameEntrance(args)).toBe(false); connected = true;
    expect(dispatcher.publishGameEntrance(args)).toBe(true);
    expect(messages).toEqual([{ version: 1, type: 'game-entrance', ...args, id: 'game-event', issuedAtMs: 2000, expiresAtMs: 12000, durationMs: 6000 }]);
    expect(dispatcher.publishGameEntrance(args)).toBe(false); dispatcher.stop(); expect(dispatcher.publishGameEntrance({ ...args, generation: 2 })).toBe(false);
});
