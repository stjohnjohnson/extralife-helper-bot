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

        it('should return null when no data is returned', async () => {
            makeTwitchApiRequest.mockResolvedValue({});

            const result = await getStreamInfo('testchannel', 'client-id', 'access-token');

            expect(result).toBeNull();
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

            expect(getValidAccessToken).toHaveBeenCalledWith(mockConfig, mockLogger);
            expect(makeTwitchApiRequest).toHaveBeenCalledWith(
                '/streams?user_login=testchannel',
                {},
                'test-client-id',
                'mock-access-token'
            );
            expect(mockLogger.info).toHaveBeenCalledWith('Stream viewer count', {
                channel: 'testchannel',
                viewerCount: 42,
                game: 'Minecraft',
                title: 'Building awesome stuff!',
                language: 'en',
                startedAt: '2025-10-26T12:00:00Z'
            });
        });

        it('should log offline status when stream is offline', async () => {
            getValidAccessToken.mockResolvedValue('mock-access-token');
            makeTwitchApiRequest.mockResolvedValue({
                data: []
            });

            await logViewerCount(mockConfig, mockLogger);

            expect(mockLogger.info).toHaveBeenCalledWith('Stream status', {
                channel: 'testchannel',
                status: 'offline'
            });
        });

        it('should log error when token retrieval fails', async () => {
            const error = new Error('Token error');
            getValidAccessToken.mockRejectedValue(error);

            await logViewerCount(mockConfig, mockLogger);

            expect(mockLogger.error).toHaveBeenCalledWith('Error getting viewer count', {
                channel: 'testchannel',
                error: 'Token error'
            });
        });

        it('should log error when stream info retrieval fails', async () => {
            getValidAccessToken.mockResolvedValue('mock-access-token');
            makeTwitchApiRequest.mockRejectedValue(new Error('API Error'));

            await logViewerCount(mockConfig, mockLogger);

            expect(mockLogger.error).toHaveBeenCalledWith('Error getting viewer count', {
                channel: 'testchannel',
                error: 'API Error'
            });
        });
    });

    describe('startViewerCountMonitoring', () => {
        it('should start monitoring with default 5 minute interval', () => {
            getValidAccessToken.mockResolvedValue('mock-access-token');
            makeTwitchApiRequest.mockResolvedValue({ data: [] });

            const interval = startViewerCountMonitoring(mockConfig, mockLogger);

            expect(mockLogger.info).toHaveBeenCalledWith('Starting viewer count monitoring', {
                channel: 'testchannel',
                intervalMinutes: 5
            });

            // Verify initial call is made
            expect(getValidAccessToken).toHaveBeenCalledWith(mockConfig, mockLogger);

            // Verify interval is set correctly (5 minutes = 300000ms)
            expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 300000);
            expect(interval).toBeDefined();
        });

        it('should start monitoring with custom interval', () => {
            getValidAccessToken.mockResolvedValue('mock-access-token');
            makeTwitchApiRequest.mockResolvedValue({ data: [] });

            startViewerCountMonitoring(mockConfig, mockLogger, 10);

            expect(mockLogger.info).toHaveBeenCalledWith('Starting viewer count monitoring', {
                channel: 'testchannel',
                intervalMinutes: 10
            });

            // Verify interval is set correctly (10 minutes = 600000ms)
            expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 600000);
        });

        it('should call logViewerCount periodically', () => {
            getValidAccessToken.mockResolvedValue('mock-access-token');
            makeTwitchApiRequest.mockResolvedValue({ data: [] });

            startViewerCountMonitoring(mockConfig, mockLogger, 1); // 1 minute for testing

            // Initial call should have been made
            expect(getValidAccessToken).toHaveBeenCalledTimes(1);

            // Verify the interval callback function works
            const intervalCallback = setInterval.mock.calls[0][0];
            intervalCallback(); // Manually call the interval function

            // Should have been called again
            expect(getValidAccessToken).toHaveBeenCalledTimes(2);
        });
    });

    describe('stopViewerCountMonitoring', () => {
        it('should stop monitoring interval and log message', () => {
            const mockInterval = 12345;
            global.clearInterval = jest.fn();

            stopViewerCountMonitoring(mockInterval, mockLogger);

            expect(clearInterval).toHaveBeenCalledWith(mockInterval);
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
                intervalMinutes: 1
            });

            // Verify initial call was made
            expect(getValidAccessToken).toHaveBeenCalledWith(mockConfig, mockLogger);

            // Stop monitoring
            stopViewerCountMonitoring(interval, mockLogger);

            expect(mockLogger.info).toHaveBeenCalledWith('Stopped viewer count monitoring');
        });
    });
});