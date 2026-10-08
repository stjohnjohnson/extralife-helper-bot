const { createInitialState, reduceObservation, validateSessionState } = require('../src/broadcastSession/state');
const options = { graceMs: 900000, cadenceMs: 60000, newSessionId: () => 'stable-id' };
const empty = () => createInitialState({ mode: 'production', channel: 'streamer' });
const observe = (state, status, time, extra = {}) => reduceObservation(state, { status, observedAtMs: time, ...extra }, options);
const live = () => observe(empty(), 'online', 7200000, { startedAtMs: 0, streamId: 'twitch-1' });

test('starts mid-broadcast from Twitch time without mutating input', () => {
    const before = empty();
    const after = observe(before, 'online', 7200000, { startedAtMs: 0, streamId: 'twitch-1' });
    expect(after).toMatchObject({ sessionId: 'stable-id', startedAtMs: 0, liveTotalCents: 0, recoveryBaselineMs: 7200000 });
    expect(before.sessionId).toBeNull();
});
test('changed Twitch metadata and short offline interruption retain original identity', () => {
    const pending = observe(live(), 'offline', 7260000);
    const after = observe(pending, 'online', 7300000, { startedAtMs: 7290000, streamId: 'new-twitch-id' });
    expect(after).toMatchObject({ sessionId: 'stable-id', startedAtMs: 0, offlineSinceMs: null });
});
test.each([899999, 900000, 900001])('grace boundary %i requires continuous confirmed observations', duration => {
    let state = observe(live(), 'offline', 7260000);
    for (let elapsed = 60000; elapsed < Math.min(duration, 900000); elapsed += 60000) state = observe(state, 'offline', 7260000 + elapsed);
    state = observe(state, 'offline', 7260000 + duration);
    expect(state.endedAtMs).toBe(duration < 900000 ? null : 7260000 + duration);
    if (duration >= 900000) {
        const next = observe(state, 'online', 8300000, { startedAtMs: 8290000, streamId: 'next' });
        expect(next.startedAtMs).toBe(8290000);
        expect(next.liveTotalCents).toBe(0);
    }
});
test('unknown and missing samples cannot prove sustained offline', () => {
    let state = observe(live(), 'offline', 7260000);
    state = observe(state, 'unknown', 7300000);
    expect(state.offlineSinceMs).toBeNull();
    state = observe(state, 'offline', 9000000);
    expect(state).toMatchObject({ offlineSinceMs: 9000000, endedAtMs: null, sessionId: 'stable-id' });
    state = observe(state, 'offline', 10000000);
    expect(state).toMatchObject({ offlineSinceMs: 10000000, endedAtMs: null });
});
test('confirmed offline followed by live at grace starts fresh without trusting Twitch ID', () => {
    let state = observe(live(), 'offline', 7260000);
    for (let elapsed = 60000; elapsed < 900000; elapsed += 60000) state = observe(state, 'offline', 7260000 + elapsed);
    state.liveTotalCents = 2500;
    state = observe(state, 'online', 8160000, { startedAtMs: 8150000, streamId: 'twitch-1' });
    expect(state).toMatchObject({ startedAtMs: 8150000, liveTotalCents: 0 });
});
test('stale observation is ignored and offline before first live creates no session', () => {
    const state = live();
    expect(observe(state, 'offline', 1)).toEqual(state);
    expect(observe(empty(), 'offline', 1).sessionId).toBeNull();
});
test.each([
    { status: 'online', observedAtMs: 100, startedAtMs: 200, streamId: 'bad' },
    { status: 'online', observedAtMs: 100, startedAtMs: 0 },
    { status: 'offline', observedAtMs: NaN },
    { status: 'invalid', observedAtMs: 100 }
])('rejects invalid observation %j', observation => {
    expect(() => reduceObservation(empty(), observation, options)).toThrow(/observation/i);
});
test('state validation protects mode, channel, version, money and ledger fields', () => {
    expect(validateSessionState(live(), { mode: 'production', channel: 'streamer' })).toEqual(live());
    for (const patch of [{ schemaVersion: 2 }, { mode: 'rehearsal' }, { channel: 'other' }, { liveTotalCents: 1.5 }, { reachedTimeCheckpoints: [-1] }, { processedDonationIds: [1] }, { startedAtMs: null }]) {
        expect(() => validateSessionState({ ...live(), ...patch }, { mode: 'production', channel: 'streamer' })).toThrow(/state/i);
    }
});
