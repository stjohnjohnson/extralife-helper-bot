/**
 * Unit tests for viewer monitoring module
 */

const {
    getStreamInfo,
    logViewerCount,
    startViewerCountMonitoring,
    stopViewerCountMonitoring
} = require('../src/viewerMonitoring.js');

// Mock the gameUpdates module
jest.mock('../src/gameUpdates.js', () => ({
    makeTwitchApiRequest: jest.fn(),
    getValidAccessToken: jest.fn()
}));

const { makeTwitchApiRequest, getValidAccessToken } = require('../src/gameUpdates.js');

describe('Viewer Monitoring Module', () => {
    let mockLogger;
    let mockConfig;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.clearAllTimers();
        jest.useFakeTimers();

        // Mock setInterval
        global.setInterval = jest.fn().mockReturnValue(12345);

        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn()
        };

        mockConfig = {
            twitch: {
                channel: 'testchannel',
                clientId: 'test-client-id',
                clientSecret: 'test-secret',
                refreshToken: 'test-refresh-token'
            }
        };
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('getStreamInfo', () => {
        it('should return stream data when stream is online', async () => {
            const mockStreamData = {
                id: '123456789',
                viewer_count: 42,
                game_name: 'Minecraft',
                title: 'Building awesome stuff!',
                language: 'en',
                started_at: '2025-10-26T12:00:00Z'
            };

            makeTwitchApiRequest.mockResolvedValue({
                data: [mockStreamData]
            });

            const result = await getStreamInfo('testchannel', 'client-id', 'access-token');

            expect(makeTwitchApiRequest).toHaveBeenCalledWith(
                '/streams?user_login=testchannel',
                {},
                'client-id',
                'access-token'
            );
            expect(result).toEqual(mockStreamData);
        });

        it('should return null when stream is offline', async () => {
            makeTwitchApiRequest.mockResolvedValue({
                data: []
            });

            const result = await getStreamInfo('testchannel', 'client-id', 'access-token');

            expect(result).toBeNull();
        });

        it('should reject a malformed service response', async () => {
            makeTwitchApiRequest.mockResolvedValue({});

            await expect(getStreamInfo('testchannel', 'client-id', 'access-token')).rejects.toThrow('Invalid Twitch stream response');
        });

        it('should throw error when API request fails', async () => {
            const error = new Error('API Error');
            makeTwitchApiRequest.mockRejectedValue(error);

            await expect(getStreamInfo('testchannel', 'client-id', 'access-token'))
                .rejects.toThrow('API Error');
        });
    });

    describe('logViewerCount', () => {
        it('should log viewer count when stream is online', async () => {
            const mockStreamData = {
                viewer_count: 42,
                game_name: 'Minecraft',
                title: 'Building awesome stuff!',
                language: 'en',
                started_at: '2025-10-26T12:00:00Z'
            };

            getValidAccessToken.mockResolvedValue('mock-access-token');
            makeTwitchApiRequest.mockResolvedValue({
                data: [mockStreamData]
            });

            await logViewerCount(mockConfig, mockLogger);

            expect(getValidAccessToken).toHaveBeenCalledWith(mockConfig, mockLogger, expect.any(AbortSignal));
            expect(makeTwitchApiRequest).toHaveBeenCalledWith(
                '/streams?user_login=testchannel',
                { signal: expect.any(AbortSignal) },
                'test-client-id',
                'mock-access-token'
            );
            expect(mockLogger.info).toHaveBeenCalledWith('Stream viewer count', {
                eventVersion: 1,
                eventType: 'viewer_sample',
                online: true,
                intervalSeconds: 60,
                channel: 'testchannel',
                viewerCount: 42,
                game: 'Minecraft',
                title: 'Building awesome stuff!',
                language: 'en',
                startedAt: '2025-10-26T12:00:00Z'
            });
        });

        it('should log error when token retrieval fails', async () => {
            const error = new Error('Token error');
            getValidAccessToken.mockRejectedValue(error);

            await logViewerCount(mockConfig, mockLogger);

            expect(mockLogger.error).toHaveBeenCalledWith('Error getting viewer count', {
                eventVersion: 1,
                eventType: 'service_error',
                service: 'twitch_viewers',
                intervalSeconds: 60,
                channel: 'testchannel',
                error: 'Token error'
            });
        });

        it('should log error when stream info retrieval fails', async () => {
            getValidAccessToken.mockResolvedValue('mock-access-token');
            makeTwitchApiRequest.mockRejectedValue(new Error('API Error'));

            await logViewerCount(mockConfig, mockLogger);

            expect(mockLogger.error).toHaveBeenCalledWith('Error getting viewer count', {
                eventVersion: 1,
                eventType: 'service_error',
                service: 'twitch_viewers',
                intervalSeconds: 60,
                channel: 'testchannel',
                error: 'API Error'
            });
        });
    });

    describe('startViewerCountMonitoring', () => {
        it('should start monitoring with default 60 second interval', () => {
            getValidAccessToken.mockResolvedValue('mock-access-token');
            makeTwitchApiRequest.mockResolvedValue({ data: [] });

            const interval = startViewerCountMonitoring(mockConfig, mockLogger);

            expect(mockLogger.info).toHaveBeenCalledWith('Starting viewer count monitoring', {
                channel: 'testchannel',
                intervalSeconds: 60
            });

            // Verify initial call is made
            expect(getValidAccessToken).toHaveBeenCalledWith(mockConfig, mockLogger, expect.any(AbortSignal));

            // Verify interval is set correctly (5 minutes = 300000ms)
            expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
            expect(interval).toBeDefined();
        });

        it('should start monitoring with custom interval', () => {
            getValidAccessToken.mockResolvedValue('mock-access-token');
            makeTwitchApiRequest.mockResolvedValue({ data: [] });

            mockConfig.twitch.viewerSampleIntervalSeconds = 120;
            startViewerCountMonitoring(mockConfig, mockLogger);

            expect(mockLogger.info).toHaveBeenCalledWith('Starting viewer count monitoring', {
                channel: 'testchannel',
                intervalSeconds: 120
            });

            // Verify interval is set correctly (10 minutes = 600000ms)
            expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 120000);
        });

        it('should call logViewerCount periodically', async () => {
            getValidAccessToken.mockResolvedValue('mock-access-token');
            makeTwitchApiRequest.mockResolvedValue({ data: [] });

            startViewerCountMonitoring(mockConfig, mockLogger, 1); // 1 minute for testing

            // Initial call should have been made
            expect(getValidAccessToken).toHaveBeenCalledTimes(1);

            // Verify the interval callback function works
            const intervalCallback = setInterval.mock.calls[0][0];
            for (let index = 0; index < 8; index++) await Promise.resolve();
            await intervalCallback(); // Manually call the interval function

            // Should have been called again
            expect(getValidAccessToken).toHaveBeenCalledTimes(2);
        });
    });

    describe('stopViewerCountMonitoring', () => {
        it('should stop monitoring interval and log message', () => {
            const mockInterval = { active: true, timer: 12345 };
            global.clearInterval = jest.fn();

            stopViewerCountMonitoring(mockInterval, mockLogger);

            expect(clearInterval).toHaveBeenCalledWith(mockInterval.timer);
            expect(mockLogger.info).toHaveBeenCalledWith('Stopped viewer count monitoring');
        });

        it('should handle null interval gracefully', () => {
            global.clearInterval = jest.fn();

            stopViewerCountMonitoring(null, mockLogger);

            expect(clearInterval).not.toHaveBeenCalled();
            expect(mockLogger.info).not.toHaveBeenCalled();
        });

        it('should handle undefined interval gracefully', () => {
            global.clearInterval = jest.fn();

            stopViewerCountMonitoring(undefined, mockLogger);

            expect(clearInterval).not.toHaveBeenCalled();
            expect(mockLogger.info).not.toHaveBeenCalled();
        });
    });

    describe('Integration scenarios', () => {
        it('should handle complete monitoring cycle', () => {
            getValidAccessToken.mockResolvedValue('mock-access-token');
            makeTwitchApiRequest.mockResolvedValue({ data: [] });

            // Start monitoring
            const interval = startViewerCountMonitoring(mockConfig, mockLogger, 1);

            // Verify initial setup
            expect(mockLogger.info).toHaveBeenCalledWith('Starting viewer count monitoring', {
                channel: 'testchannel',
                intervalSeconds: 60
            });

            // Verify initial call was made
            expect(getValidAccessToken).toHaveBeenCalledWith(mockConfig, mockLogger, expect.any(AbortSignal));

            // Stop monitoring
            stopViewerCountMonitoring(interval, mockLogger);

            expect(mockLogger.info).toHaveBeenCalledWith('Stopped viewer count monitoring');
        });
    });
});
describe('viewer lifecycle safety', () => {
    let logger;
    const config = { twitch: { channel: 'x', clientId: 'c', viewerSampleIntervalSeconds: 60 } };
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        logger = { info: jest.fn(), error: jest.fn() };
    });
    afterEach(() => jest.useRealTimers());
    test('offline observations are valid zero samples', async () => {
        getValidAccessToken.mockResolvedValue('token');
        makeTwitchApiRequest.mockResolvedValue({ data: [] });
        await logViewerCount(config, logger);
        expect(logger.info).toHaveBeenCalledWith('Stream offline', expect.objectContaining({ online: false, viewerCount: 0, intervalSeconds: 60 }));
    });
    test('overlap is skipped and late shutdown results are suppressed', async () => {
        let finish;
        getValidAccessToken.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        makeTwitchApiRequest.mockResolvedValue({ data: [] });
        const monitor = startViewerCountMonitoring({ ...config, twitch: { ...config.twitch, viewerSampleIntervalSeconds: 1 } }, logger);
        await jest.advanceTimersByTimeAsync(3000);
        expect(getValidAccessToken).toHaveBeenCalledTimes(1);
        stopViewerCountMonitoring(monitor, logger);
        finish('token');
        for (let index = 0; index < 8; index++) await Promise.resolve();
        expect(logger.info.mock.calls.filter(([message]) => message === 'Stream offline')).toHaveLength(0);
    });
});

describe('typed broadcast observations', () => {
    const config = { twitch: { channel: 'streamer', clientId: 'c', viewerSampleIntervalSeconds: 1 } };
    let logger;
    beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); logger = { info: jest.fn(), error: jest.fn() }; getValidAccessToken.mockResolvedValue('token'); });
    afterEach(() => jest.useRealTimers());
    test.each([
        [{ data: [] }, { status: 'offline', observedAtMs: 1000 }],
        [{ data: [{ id: 'stream-id', started_at: '1970-01-01T00:00:00.000Z', viewer_count: 1 }] }, { status: 'online', observedAtMs: 1000, streamId: 'stream-id', startedAtMs: 0 }],
        [{ data: [{ id: 'stream-id', started_at: 'invalid' }] }, { status: 'unknown', observedAtMs: 1000 }],
        [{}, { status: 'unknown', observedAtMs: 1000 }]
    ])('emits typed observation from response %j', async (response, expected) => {
        makeTwitchApiRequest.mockResolvedValue(response);
        const observed = []; await logViewerCount(config, logger, () => true, { onObservation: value => observed.push(value), nowMs: () => 1000 });
        expect(observed).toEqual([expected]);
    });
    test('a subscriber failure does not convert successful offline status into another observation', async () => {
        makeTwitchApiRequest.mockResolvedValue({ data: [] });
        const observed = [];
        await logViewerCount(config, logger, () => true, { onObservation: value => { observed.push(value); throw new Error('listener'); }, nowMs: () => 1000 });
        expect(observed).toEqual([{ status: 'offline', observedAtMs: 1000 }]);
        expect(logger.error).toHaveBeenCalledWith('Broadcast observer failed');
    });
    test('network errors and timeout are unknown and stop cancels the outstanding sample', async () => {
        makeTwitchApiRequest.mockRejectedValueOnce(new Error('network'));
        const observed = []; const options = { onObservation: value => observed.push(value), nowMs: () => 1000 };
        await logViewerCount(config, logger, () => true, options);
        expect(observed).toEqual([{ status: 'unknown', observedAtMs: 1000 }]);
        getValidAccessToken.mockImplementation(() => new Promise(() => {}));
        const monitor = startViewerCountMonitoring(config, logger, options);
        await jest.advanceTimersByTimeAsync(10000);
        expect(observed).toHaveLength(2);
        expect(observed[1].status).toBe('unknown');
        stopViewerCountMonitoring(monitor, logger);
        await jest.advanceTimersByTimeAsync(20000);
        expect(observed).toHaveLength(2);
    });
});
