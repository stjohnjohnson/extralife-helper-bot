const { validObservation } = require('../src/streamObservation');
test.each([
    { status: 'online', observedAtMs: 100, startedAtMs: 0, streamId: 's' },
    { status: 'offline', observedAtMs: 100 },
    { status: 'unknown', observedAtMs: 100 }
])('accepts valid Twitch sample %j', sample => expect(validObservation(sample)).toBeTruthy());
test.each([
    null, {}, { status: 'online', observedAtMs: 100, startedAtMs: 200, streamId: 'bad' },
    { status: 'online', observedAtMs: 100, startedAtMs: 0 },
    { status: 'offline', observedAtMs: NaN }, { status: 'offline', observedAtMs: -1 },
    { status: 'invalid', observedAtMs: 100 }
])('rejects invalid Twitch sample %j', sample => expect(validObservation(sample)).toBeFalsy());
