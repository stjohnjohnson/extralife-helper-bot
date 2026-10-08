const { EventEmitter } = require('events');
const https = require('https');

jest.mock('https', () => ({ request: jest.fn() }));

function queueResponses(...responses) {
    responses.forEach(response => {
        https.request.mockImplementationOnce((options, callback) => {
            const request = new EventEmitter();
            request.write = jest.fn();
            request.end = jest.fn(() => {
                if (response.requestError) {
                    request.emit('error', response.requestError);
                    return;
                }

                const result = new EventEmitter();
                result.statusCode = response.statusCode ?? 200;
                callback(result);
                if (response.body !== undefined) result.emit('data', response.body);
                result.emit('end');
            });
            return request;
        });
    });
}

function loadModule() {
    return require('../src/gameUpdates.js');
}

describe('Twitch API integration boundaries', () => {
    let now = 1000000;
    let dateNowSpy;
    const logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    };

    beforeEach(() => {
        jest.clearAllMocks();
        https.request.mockReset();
        now += 7200000;
        dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    });

    afterEach(() => dateNowSpy.mockRestore());

    test('parses successful responses and sends PATCH bodies', async () => {
        queueResponses({ statusCode: 200, body: '{"data":[{"id":"game-1"}]}' });
        const { makeTwitchApiRequest } = loadModule();

        const result = await makeTwitchApiRequest(
            '/channels?broadcaster_id=broadcaster-1',
            { method: 'PATCH', body: { game_id: 'game-1' }, headers: { 'X-Test': 'yes' } },
            'client-id',
            'access-token'
        );

        expect(result).toEqual({ data: [{ id: 'game-1' }] });
        const [options] = https.request.mock.calls[0];
        expect(options).toMatchObject({
            hostname: 'api.twitch.tv',
            path: '/helix/channels?broadcaster_id=broadcaster-1',
            method: 'PATCH',
            headers: expect.objectContaining({
                'Client-ID': 'client-id',
                'Authorization': 'Bearer access-token',
                'X-Test': 'yes'
            })
        });
        expect(https.request.mock.results[0].value.write).toHaveBeenCalledWith('{"game_id":"game-1"}');
    });

    test.each([
        [{ statusCode: 204 }, {}],
        [{ statusCode: 401 }, new Error('Empty response with status 401')],
        [{ statusCode: 400, body: '{"message":"bad request"}' }, new Error('API Error 400: bad request')],
        [{ statusCode: 200, body: 'not-json' }, new Error('Failed to parse response (8 chars): "not-json"')]
    ])('handles empty, unsuccessful, and malformed responses', async (response, expected) => {
        queueResponses(response);
        const { makeTwitchApiRequest } = loadModule();

        if (expected instanceof Error) {
            await expect(makeTwitchApiRequest('/users', {}, 'client', 'token')).rejects.toThrow(expected.message);
        } else {
            await expect(makeTwitchApiRequest('/users', {}, 'client', 'token')).resolves.toEqual(expected);
        }
    });

    test('propagates request transport errors', async () => {
        queueResponses({ requestError: new Error('socket closed') });
        const { makeTwitchApiRequest } = loadModule();

        await expect(makeTwitchApiRequest('/users', {}, 'client', 'token')).rejects.toThrow('socket closed');
    });

    test('refreshes and caches a user access token', async () => {
        queueResponses({ body: '{"access_token":"fresh-token","expires_in":3600}' });
        const { getValidAccessToken } = loadModule();
        const config = { twitch: { clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh' } };

        await expect(getValidAccessToken(config, logger)).resolves.toBe('fresh-token');
        await expect(getValidAccessToken(config, logger)).resolves.toBe('fresh-token');

        expect(https.request).toHaveBeenCalledTimes(1);
        expect(https.request.mock.results[0].value.write).toHaveBeenCalledWith(
            'client_id=client&client_secret=secret&grant_type=refresh_token&refresh_token=refresh'
        );
    });

    test('rejects missing refresh credentials and failed refreshes', async () => {
        let gameUpdates = loadModule();
        await expect(gameUpdates.getValidAccessToken({ twitch: {} }, logger)).rejects.toThrow(
            'TWITCH_CLIENT_SECRET and TWITCH_REFRESH_TOKEN are required'
        );

        queueResponses({ statusCode: 401, body: '{"message":"invalid refresh"}' });
        gameUpdates = loadModule();
        await expect(gameUpdates.getValidAccessToken({
            twitch: { clientId: 'client', clientSecret: 'secret', refreshToken: 'bad' }
        }, logger)).rejects.toThrow('Token refresh failed: Failed to refresh token: invalid refresh');
    });

    test('reports malformed token refresh responses', async () => {
        queueResponses({ body: 'not-json' });
        const { getValidAccessToken } = loadModule();

        await expect(getValidAccessToken({
            twitch: { clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh' }
        }, logger)).rejects.toThrow('Token refresh failed: Failed to parse refresh response');
    });

    test('marker authentication never logs raw refresh response text', async () => {
        const { createStreamMarkerService } = require('../src/streamMarkers');
        queueResponses({ statusCode: 401, body: '{"message":"rejected FAKE_REFRESH_SECRET"}' });
        const service = createStreamMarkerService({
            twitch: { channel: 'streamer', clientId: 'client', clientSecret: 'secret', refreshToken: 'FAKE_REFRESH_SECRET' },
            streamMarkers: { donationThresholdCents: 10000 }
        }, logger);
        try {
            expect(await service.markDonation({ donationID: 'd-1', amount: 100, displayName: 'Donor' })).toBeNull();
            const logs = JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls]);
            expect(logs).not.toContain('FAKE_REFRESH_SECRET');
            expect(logger.warn).toHaveBeenCalledWith('Donation stream marker failed', expect.objectContaining({ donationId: 'd-1' }));
        } finally {
            service.stop();
        }
    });

    test('an aborted partial auth response does not lock out subsequent donations', async () => {
        jest.useFakeTimers({ now });
        const { createStreamMarkerService } = require('../src/streamMarkers');
        https.request.mockImplementationOnce((options, callback) => {
            const req = new EventEmitter();
            req.write = jest.fn();
            req.end = () => {
                const res = new EventEmitter();
                res.statusCode = 200;
                callback(res);
                res.emit('data', '{"access_token":');
                res.emit('aborted');
            };
            return req;
        });
        const service = createStreamMarkerService({
            twitch: { channel: 'streamer', clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh' },
            streamMarkers: { donationThresholdCents: 10000 }
        }, logger);
        try {
            const first = service.markDonation({ donationID: 'd-1', amount: 100, displayName: 'Donor' });
            await jest.advanceTimersByTimeAsync(10000);
            expect(await first).toBeNull();
            queueResponses(
                { body: '{"access_token":"fresh-token","expires_in":3600}' },
                { body: '{"data":[{"id":"broadcaster-1"}]}' },
                { body: '{"data":[{"id":"marker-2","position_seconds":120}]}' }
            );
            const second = service.markDonation({ donationID: 'd-2', amount: 100, displayName: 'Donor' });
            await jest.advanceTimersByTimeAsync(10000);
            expect(await second).toEqual({ id: 'marker-2', position_seconds: 120 });
            expect(https.request).toHaveBeenCalledTimes(4);
        } finally {
            service.stop();
            jest.useRealTimers();
        }
    });

    test('handles asynchronous response errors without an unhandled event', async () => {
        let response;
        https.request.mockImplementationOnce((options, callback) => {
            const req = new EventEmitter();
            req.end = () => {
                response = new EventEmitter();
                callback(response);
            };
            return req;
        });
        const operation = loadModule().makeTwitchApiRequest('/streams/markers', {}, 'client', 'token');
        const outcome = operation.catch(error => error);
        expect(() => response.emit('error', new Error('response transport failure'))).not.toThrow();
        expect(await outcome).toMatchObject({ message: 'response transport failure' });
    });

    test('looks up broadcasters, searches categories, and updates channels', async () => {
        queueResponses(
            { body: '{"data":[{"id":"broadcaster-1"}]}' },
            { body: '{"data":[{"id":"game-1","name":"Balatro"}]}' },
            { statusCode: 204 }
        );
        const { getBroadcasterIdFromChannel, searchGameCategory, updateChannelGame } = loadModule();

        await expect(getBroadcasterIdFromChannel('channel', 'client', 'token')).resolves.toBe('broadcaster-1');
        await expect(searchGameCategory('Balatro', 'client', 'token', logger)).resolves.toBe('game-1');
        await expect(updateChannelGame('broadcaster-1', 'game-1', 'client', 'token')).resolves.toBeUndefined();
    });

    test('rejects missing broadcasters and wraps category search errors', async () => {
        queueResponses({ body: '{"data":[]}' }, { statusCode: 500, body: '{"message":"unavailable"}' });
        const { getBroadcasterIdFromChannel, searchGameCategory } = loadModule();

        await expect(getBroadcasterIdFromChannel('missing', 'client', 'token')).rejects.toThrow(
            'Channel "missing" not found'
        );
        await expect(searchGameCategory('Balatro', 'client', 'token', logger)).rejects.toThrow(
            'Failed to search for game "Balatro": API Error 500: unavailable'
        );
    });

    test('updates the category and sends the configured chat notification', async () => {
        queueResponses(
            { body: '{"access_token":"fresh-token","expires_in":3600}' },
            { body: '{"data":[{"id":"broadcaster-1"}]}' },
            { body: '{"data":[{"id":"game-1","name":"Jackbox Party Packs"}]}' },
            { statusCode: 204 }
        );
        const { sendGameUpdateNotification } = loadModule();
        const twitchClient = { say: jest.fn().mockResolvedValue() };
        const config = {
            twitch: {
                channel: 'channel',
                clientId: 'client-id',
                clientSecret: 'secret',
                refreshToken: 'refresh'
            },
            gameUpdates: { messageTemplate: 'Up next: {game}' }
        };

        await sendGameUpdateNotification('The Jackbox Survey Scramble', config, twitchClient, logger);

        expect(twitchClient.say).toHaveBeenCalledWith('channel', 'Up next: The Jackbox Survey Scramble');
        expect(logger.info).toHaveBeenCalledWith('Successfully updated Twitch channel game', {
            game: 'The Jackbox Survey Scramble',
            gameId: 'game-1',
            broadcasterId: 'broadcaster-1',
            channel: 'channel'
        });
    });

    test('skips updates when Twitch has no matching category', async () => {
        queueResponses(
            { body: '{"access_token":"fresh-token","expires_in":3600}' },
            { body: '{"data":[{"id":"broadcaster-1"}]}' },
            { body: '{"data":[]}' }
        );
        const { sendGameUpdateNotification } = loadModule();
        const twitchClient = { say: jest.fn() };
        const config = {
            twitch: { channel: 'channel', clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh' },
            gameUpdates: {}
        };

        await sendGameUpdateNotification('Unknown Game', config, twitchClient, logger);

        expect(logger.warn).toHaveBeenCalledWith('Game category not found on Twitch', { game: 'Unknown Game' });
        expect(twitchClient.say).not.toHaveBeenCalled();
    });
});
