const {
    makeTwitchApiRequest, getValidAccessToken, getBroadcasterIdFromChannel
} = require('../src/gameUpdates');
jest.mock('../src/gameUpdates', () => ({
    makeTwitchApiRequest: jest.fn(),
    getValidAccessToken: jest.fn(),
    getBroadcasterIdFromChannel: jest.fn()
}));
const { createStreamMarkerService } = require('../src/streamMarkers');

const config = {
    streamMarkers: { donationThresholdCents: 10000 },
    twitch: { channel: 'streamer', clientId: 'client-id' }
};
const donation = { donationID: 'd-1', amount: 100, displayName: 'Full Display Name' };
const marker = { id: 'marker-1', position_seconds: 90001, created_at: '2026-10-08T01:00:00Z', description: 'Donation: $100.00 from Full Display Name' };
let service;
let logger;

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    getValidAccessToken.mockResolvedValue('test-token');
    getBroadcasterIdFromChannel.mockResolvedValue('broadcaster-id');
    makeTwitchApiRequest.mockResolvedValue({ data: [marker] });
    service = createStreamMarkerService(config, logger);
});
afterEach(() => {
    service.stop();
    jest.useRealTimers();
});

async function flush() {
    for (let i = 0; i < 12; i++) await Promise.resolve();
}

test('creates the exact Helix marker at the inclusive threshold', async () => {
    expect(await service.markDonation(donation)).toEqual(marker);
    expect(makeTwitchApiRequest).toHaveBeenCalledWith('/streams/markers', {
        method: 'POST', signal: expect.any(AbortSignal),
        body: { user_id: 'broadcaster-id', description: 'Donation: $100.00 from Full Display Name' }
    }, 'client-id', 'test-token');
    expect(logger.info).toHaveBeenCalledWith('Created donation stream marker', expect.objectContaining({ donationId: 'd-1', markerId: 'marker-1', positionSeconds: 90001 }));
});

test.each([99.99, 0, -5, null, '', 'NaN', Infinity, '100.001'])('ignores nonqualifying or malformed donation amount %s', async amount => {
    expect(await service.markDonation({ ...donation, amount })).toBeNull();
    expect(getValidAccessToken).not.toHaveBeenCalled();
});

test('accepts decimal string amounts at a cent boundary', async () => {
    service.stop();
    service = createStreamMarkerService({ ...config, streamMarkers: { donationThresholdCents: 10001 } }, logger);
    expect(await service.markDonation({ ...donation, amount: '100.00' })).toBeNull();
    expect(await service.markDonation({ ...donation, amount: '100.01' })).toEqual(marker);
    expect(makeTwitchApiRequest.mock.calls[0][1].body.description).toBe('Donation: $100.01 from Full Display Name');
});

test.each([{}, { streamMarkers: { donationThresholdCents: null } }])('disabled configuration never contacts Twitch', async overrides => {
    service.stop();
    service = createStreamMarkerService({ twitch: config.twitch, ...overrides }, logger);
    expect(await service.markDonation(donation)).toBeNull();
    expect(getValidAccessToken).not.toHaveBeenCalled();
});

test.each([undefined, '', '   '])('uses Anonymous for missing/blank donor name %s', async displayName => {
    await service.markDonation({ ...donation, displayName });
    expect(makeTwitchApiRequest.mock.calls[0][1].body.description).toBe('Donation: $100.00 from Anonymous');
});

test('preserves a name that makes exactly 140 characters', async () => {
    await service.markDonation({ ...donation, displayName: 'A'.repeat(117) });
    expect(makeTwitchApiRequest.mock.calls[0][1].body.description).toBe('Donation: $100.00 from ' + 'A'.repeat(117));
});

test('shortens only a long Unicode name within 140 characters', async () => {
    await service.markDonation({ ...donation, displayName: '😀'.repeat(140) });
    const description = makeTwitchApiRequest.mock.calls[0][1].body.description;
    expect(description).toBe('Donation: $100.00 from ' + '😀'.repeat(58) + '…');
    expect(description.length).toBeLessThanOrEqual(140);
    expect(description.isWellFormed()).toBe(true);
});

test('creates 100 independent markers and shares concurrent token and broadcaster lookups', async () => {
    const results = await Promise.all(Array.from({ length: 100 }, (_, i) => service.markDonation({ ...donation, donationID: `d-${i}`, displayName: `Donor ${i}` })));
    expect(results).toHaveLength(100);
    expect(results.every(result => result.id === 'marker-1')).toBe(true);
    expect(getValidAccessToken).toHaveBeenCalledTimes(1);
    expect(getBroadcasterIdFromChannel).toHaveBeenCalledTimes(1);
    expect(makeTwitchApiRequest).toHaveBeenCalledTimes(100);
    expect(makeTwitchApiRequest.mock.calls[99][1].body.description).toBe('Donation: $100.00 from Donor 99');
});

test('caches broadcaster ID but checks token validity on later donations', async () => {
    await service.markDonation(donation);
    getValidAccessToken.mockResolvedValue('new-token');
    await service.markDonation({ ...donation, donationID: 'd-2' });
    expect(getBroadcasterIdFromChannel).toHaveBeenCalledTimes(1);
    expect(makeTwitchApiRequest.mock.calls[1][3]).toBe('new-token');
});

test.each([401, 403, 404, 429, 500])('contains HTTP %s without retry or credential leakage', async statusCode => {
    makeTwitchApiRequest.mockRejectedValueOnce(Object.assign(new Error('SECRET RESPONSE test-token'), { statusCode }));
    expect(await service.markDonation(donation)).toBeNull();
    expect(makeTwitchApiRequest).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('test-token');
    expect(logger.warn).toHaveBeenCalledWith(statusCode === 404 ? 'Skipped donation stream marker: stream offline or VOD unavailable' : 'Donation stream marker failed', expect.objectContaining({ donationId: 'd-1', statusCode }));
    expect(await service.markDonation({ ...donation, donationID: 'd-2' })).toEqual(marker);
});

test.each(['auth', 'lookup', 'network', 'response'])('contains %s failure', async failure => {
    if (failure === 'auth') getValidAccessToken.mockRejectedValueOnce(new Error('secret auth'));
    if (failure === 'lookup') getBroadcasterIdFromChannel.mockRejectedValueOnce(new Error('lookup'));
    if (failure === 'network') makeTwitchApiRequest.mockRejectedValueOnce(new Error('network'));
    if (failure === 'response') makeTwitchApiRequest.mockResolvedValueOnce({ data: [] });
    expect(await service.markDonation(donation)).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
});

test('deadline aborts an in-flight POST and never retries', async () => {
    makeTwitchApiRequest.mockImplementation(() => new Promise(() => {}));
    const operation = service.markDonation(donation);
    await flush();
    const signal = makeTwitchApiRequest.mock.calls[0][1].signal;
    await jest.advanceTimersByTimeAsync(10000);
    expect(await operation).toBeNull();
    expect(signal.aborted).toBe(true);
    expect(makeTwitchApiRequest).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
});

test.each(['timeout', 'stop'])('%s prevents writes when authentication completes late', async action => {
    let resolveToken;
    getValidAccessToken.mockImplementation(() => new Promise(resolve => { resolveToken = resolve; }));
    const operation = service.markDonation(donation);
    if (action === 'timeout') await jest.advanceTimersByTimeAsync(10000);
    else service.stop();
    expect(await operation).toBeNull();
    expect(getValidAccessToken.mock.calls[0][2].aborted).toBe(true);
    resolveToken('late-token');
    await flush();
    expect(makeTwitchApiRequest).not.toHaveBeenCalled();
    expect(getBroadcasterIdFromChannel).not.toHaveBeenCalled();
});

test('stop aborts pending POST and prevents new operations', async () => {
    makeTwitchApiRequest.mockImplementation(() => new Promise(() => {}));
    const operation = service.markDonation(donation);
    await flush();
    const signal = makeTwitchApiRequest.mock.calls[0][1].signal;
    service.stop();
    expect(await operation).toBeNull();
    expect(signal.aborted).toBe(true);
    expect(await service.markDonation({ ...donation, donationID: 'd-2' })).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
});
