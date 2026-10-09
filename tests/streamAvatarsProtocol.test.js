const { publicSession } = require('../src/streamAvatars/protocol');
const { decodeClientMessage, validateServerMessage } = require('../src/streamAvatars/protocol');
const { createInitialState } = require('../src/broadcastSession/state');
const snapshot = { version: 2, type: 'snapshot', mode: 'production', generation: 1, serverNowMs: 1000, session: publicSession(createInitialState({ mode: 'production', channel: 'x' })), elapsedMs: 0, integration: { active: false, crowdIds: [] }, features: ['hearts', 'crowd', 'session'] };
test('accepts only finite typed protocol vocabulary', () => {
    expect(decodeClientMessage(JSON.stringify({ version: 2, type: 'auth', token: 'secret' })).type).toBe('auth');
    expect(decodeClientMessage(JSON.stringify({ version: 2, type: 'ready', capabilities: ['hearts'], resolution: { width: 1920, height: 1080 } })).type).toBe('ready');
    expect(validateServerMessage(snapshot)).toEqual(snapshot);
    expect(validateServerMessage({ version: 2, type: 'clear', mode: 'production', generation: 1 }).type).toBe('clear');
});
test.each(['{bad', JSON.stringify({ version: 2, type: 'command', text: 'loadstring' }), JSON.stringify({ version: 3, type: 'heartbeat' }), JSON.stringify({ version: 2, type: 'auth', token: 'secret', lua: 'execute' }), JSON.stringify({ version: 2, type: 'diagnostic', code: 'secret token' }), JSON.stringify({ version: 2, type: 'ready', capabilities: ['arbitrary-script'], resolution: { width: 0, height: 1 } })])('rejects malformed or executable client payload', raw => { expect(() => decodeClientMessage(raw)).toThrow('Invalid Stream Avatars message'); });
test.each([{ ...snapshot, elapsedMs: NaN }, { ...snapshot, generation: -1 }, { ...snapshot, session: { ...snapshot.session, mode: 'rehearsal' } }, { version: 2, type: 'hearts', mode: 'production', generation: 1, sessionId: 's', id: 'i', issuedAtMs: 1000, expiresAtMs: 900, durationMs: 5000 }, { version: 2, type: 'crowd', mode: 'production', generation: 1, crowdIds: ['arbitrary user'] }])('rejects invalid server payload', value => { expect(() => validateServerMessage(value)).toThrow(/message/i); });
