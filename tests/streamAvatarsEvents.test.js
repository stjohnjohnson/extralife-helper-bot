const { createEventDispatcher } = require('../src/streamAvatars/events');
test('hearts stamp real expiry, suppress repeats, and never queue disconnected effects', () => {
    const packets = []; let connected = false; let time = 1000;
    const dispatcher = createEventDispatcher({ realClock: { nowMs: () => time }, send: message => { if (!connected) return false; packets.push(message); return true; }, newEventId: () => 'id' });
    expect(dispatcher.publishHearts({ mode: 'integration', generation: 1, sessionId: 's' })).toBe(false);
    connected = true; time = 2000;
    expect(dispatcher.publishHearts({ mode: 'integration', generation: 1, sessionId: 's' })).toBe(true);
    expect(packets[0]).toMatchObject({ issuedAtMs: 2000, expiresAtMs: 12000, durationMs: 5000 });
    expect(dispatcher.publishHearts({ mode: 'integration', generation: 1, sessionId: 's' })).toBe(false);
    dispatcher.clear({ mode: 'production', generation: 2 }); expect(packets.at(-1).type).toBe('clear');
    dispatcher.stop(); expect(dispatcher.publishHearts({ mode: 'production', generation: 2, sessionId: 's' })).toBe(false);
});
