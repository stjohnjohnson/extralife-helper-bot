const { HueController } = require('../src/hueControl.js');

// Mock node-hue-api
jest.mock('node-hue-api', () => ({
    v3: {
        api: {
            createLocal: jest.fn(),
        },
        lightStates: {
            LightState: jest.fn().mockImplementation(() => ({
                on: jest.fn().mockReturnThis(),
                bri: jest.fn().mockReturnThis(),
                brightness: jest.fn().mockReturnThis(),
                xy: jest.fn().mockReturnThis(),
                hue: jest.fn().mockReturnThis(),
                sat: jest.fn().mockReturnThis(),
                ct: jest.fn().mockReturnThis()
            }))
        }
    }
}));

describe('HueController', () => {
    const mockConfig = {
        hue: {
            ipAddress: '192.168.1.100',
            username: 'test-username',
            groupId: '1'
        }
    };

    const mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
    };

    let hueController;
    let mockApi;

    beforeEach(() => {
        jest.clearAllMocks();
        hueController = new HueController(mockConfig, mockLogger);

        // Setup mock API
        mockApi = {
            groups: {
                getAll: jest.fn(),
                getGroup: jest.fn(),
                getGroupByName: jest.fn()
            },
            lights: {
                getLight: jest.fn(),
                setLightState: jest.fn()
            },
            configuration: {
                getConfiguration: jest.fn()
            }
        };

        const { v3 } = require('node-hue-api');
        v3.api.createLocal.mockReturnValue({
            connect: jest.fn().mockResolvedValue(mockApi)
        });
    });

    describe('initialize', () => {
        test('should successfully connect to Hue Bridge', async () => {
            const mockGroups = [
                { id: 1, name: 'Living Room', lights: ['1', '2', '3'] }
            ];

            mockApi.groups.getAll.mockResolvedValue(mockGroups);

            const result = await hueController.initialize();

            expect(result).toBe(true);
            expect(hueController.connected).toBe(true);
            expect(mockLogger.info).toHaveBeenCalledWith('Connected to Hue Bridge at 192.168.1.100');
            expect(mockLogger.info).toHaveBeenCalledWith('Found Hue Group: "Living Room" (3 lights)');
        });

        test('should handle missing group error', async () => {
            const mockGroups = [
                { id: 2, name: 'Kitchen', lights: ['4', '5'] }
            ];

            mockApi.groups.getAll.mockResolvedValue(mockGroups);

            const result = await hueController.initialize();

            expect(result).toBe(false);
            expect(hueController.connected).toBe(false);
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to initialize Hue Bridge connection',
                { error: 'Group 1 not found on Hue Bridge' }
            );
        });

        test('should handle connection error', async () => {
            const { v3 } = require('node-hue-api');
            v3.api.createLocal.mockReturnValue({
                connect: jest.fn().mockRejectedValue(new Error('Connection failed'))
            });

            const result = await hueController.initialize();

            expect(result).toBe(false);
            expect(hueController.connected).toBe(false);
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to initialize Hue Bridge connection',
                { error: 'Connection failed' }
            );
        });
    });

    describe('getGroupLights', () => {
        beforeEach(() => {
            hueController.connected = true;
            hueController.api = mockApi;
        });

        test('should get lights by group ID', async () => {
            const mockGroup = { lights: ['1', '2'] };
            const mockLights = [
                { id: '1', state: { on: true, bri: 254 } },
                { id: '2', state: { on: false, bri: 100 } }
            ];

            hueController.group = mockGroup; // Set the group directly
            mockApi.lights.getLight.mockResolvedValueOnce(mockLights[0]);
            mockApi.lights.getLight.mockResolvedValueOnce(mockLights[1]);

            const result = await hueController.getGroupLights();

            expect(result).toEqual(mockLights);
        });

        test('should throw error when not connected', async () => {
            hueController.connected = false;

            await expect(hueController.getGroupLights()).rejects.toThrow('Hue Bridge not connected');
        });

        test('should throw error when group not found', async () => {
            hueController.connected = true;
            hueController.api = mockApi;
            hueController.group = null; // No group set

            await expect(hueController.getGroupLights()).rejects.toThrow('Hue Bridge not connected');
        });
    });

    describe('saveLightStates', () => {
        test('should save current light states', async () => {
            const mockLights = [
                {
                    id: '1',
                    state: {
                        on: true,
                        bri: 254,
                        colormode: 'xy',
                        xy: [0.3, 0.4],
                        hue: 12000,
                        sat: 200,
                        ct: 366
                    }
                },
                {
                    id: '2',
                    state: {
                        on: false,
                        bri: 100,
                        colormode: 'ct',
                        xy: null,
                        hue: undefined,
                        sat: undefined,
                        ct: 200
                    }
                }
            ];

            const result = await hueController.saveLightStates(mockLights);

            expect(result.size).toBe(2);
            expect(result.get('1')).toEqual({
                on: true,
                bri: 254,
                colormode: 'xy',
                xy: [0.3, 0.4],
                hue: 12000,
                sat: 200,
                ct: 366
            });
            expect(result.get('2')).toEqual({
                on: false,
                bri: 100,
                colormode: 'ct',
                xy: null,
                hue: undefined,
                sat: undefined,
                ct: 200
            });
        });
    });

    describe('celebrateDonation', () => {
        test('should skip celebration when not connected', async () => {
            hueController.connected = false;

            await hueController.celebrateDonation();

            expect(mockLogger.warn).toHaveBeenCalledWith('Hue Bridge not connected, skipping celebration');
        });

        test('should skip celebration when no lights found', async () => {
            hueController.connected = true;
            hueController.api = mockApi;
            hueController.group = { lights: [] }; // Empty lights array

            await hueController.celebrateDonation();

            expect(mockLogger.warn).toHaveBeenCalledWith('No lights found in group, skipping celebration');
        });

        test('should start celebration with lights', async () => {
            hueController.connected = true;
            hueController.api = mockApi;

            const mockGroup = { lights: ['1', '2'] };
            const mockLights = [
                { id: '1', state: { on: true, bri: 254, colormode: 'xy', xy: [0.3, 0.4] } },
                { id: '2', state: { on: false, bri: 100, colormode: 'ct', ct: 200 } }
            ];

            mockApi.groups.getGroup.mockResolvedValue(mockGroup);
            mockApi.lights.getLight.mockResolvedValueOnce(mockLights[0]);
            mockApi.lights.getLight.mockResolvedValueOnce(mockLights[1]);
            mockApi.lights.setLightState.mockResolvedValue();

            // Mock the celebration animation to avoid timing issues in tests
            jest.spyOn(hueController, 'runCelebrationAnimation').mockResolvedValue();

            await hueController.celebrateDonation();

            expect(mockLogger.info).toHaveBeenCalledWith('Starting Hue celebration light show');
        });
    });

    describe('utility methods', () => {
        test('sleep should wait for specified time', async () => {
            const start = Date.now();
            await hueController.sleep(50);
            const end = Date.now();

            expect(end - start).toBeGreaterThanOrEqual(40); // Allow some tolerance
        });
    });

    describe('failure handling and animation behavior', () => {
        test('keeps available group lights when one lookup fails', async () => {
            hueController.connected = true;
            hueController.api = mockApi;
            hueController.group = { lights: ['1', '2'] };
            mockApi.lights.getLight
                .mockRejectedValueOnce(new Error('light offline'))
                .mockResolvedValueOnce({ id: '2', state: { on: true } });

            await expect(hueController.getGroupLights()).resolves.toEqual([{ id: '2', state: { on: true } }]);
            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to get light 1', { error: 'light offline' });
        });

        test('restores xy, hue/saturation, and color-temperature states', async () => {
            const { v3 } = require('node-hue-api');
            hueController.api = mockApi;
            jest.spyOn(hueController, 'sleep').mockResolvedValue();
            const states = new Map([
                ['xy-light', { on: true, bri: 200, colormode: 'xy', xy: [0.2, 0.3] }],
                ['hs-light', { on: true, bri: 180, colormode: 'hs', hue: 12000, sat: 150 }],
                ['ct-light', { on: false, bri: 100, colormode: 'ct', ct: 350 }]
            ]);

            await hueController.restoreLightStates(states);

            expect(mockApi.lights.setLightState).toHaveBeenCalledTimes(3);
            const xyState = v3.lightStates.LightState.mock.results[0].value;
            const hsState = v3.lightStates.LightState.mock.results[1].value;
            const ctState = v3.lightStates.LightState.mock.results[2].value;
            expect(xyState.xy).toHaveBeenCalledWith(0.2, 0.3);
            expect(hsState.hue).toHaveBeenCalledWith(12000);
            expect(hsState.sat).toHaveBeenCalledWith(150);
            expect(ctState.ct).toHaveBeenCalledWith(350);
        });

        test('continues restoring after an individual light fails', async () => {
            hueController.api = mockApi;
            jest.spyOn(hueController, 'sleep').mockResolvedValue();
            mockApi.lights.setLightState
                .mockRejectedValueOnce(new Error('bridge busy'))
                .mockResolvedValueOnce();

            await hueController.restoreLightStates(new Map([
                ['1', { on: true, bri: 200 }],
                ['2', { on: false, bri: 100 }]
            ]));

            expect(mockApi.lights.setLightState).toHaveBeenCalledTimes(2);
            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to restore light 1', { error: 'bridge busy' });
        });

        test('suppresses a celebration while another is in progress', async () => {
            hueController.connected = true;
            hueController.isCelebrating = true;

            await hueController.celebrateDonation();

            expect(mockLogger.info).toHaveBeenCalledWith('Hue celebration already in progress, skipping');
        });

        test('restores lights after the celebration timer and resets state', async () => {
            jest.useFakeTimers();
            hueController.connected = true;
            hueController.api = mockApi;
            hueController.group = { lights: ['1'] };
            mockApi.lights.getLight.mockResolvedValue({
                id: '1',
                state: { on: true, bri: 200, colormode: 'xy', xy: [0.2, 0.3] }
            });
            jest.spyOn(hueController, 'runCelebrationAnimation').mockResolvedValue();
            jest.spyOn(hueController, 'restoreLightStates').mockResolvedValue();

            await hueController.celebrateDonation();
            await jest.advanceTimersByTimeAsync(5000);

            expect(hueController.restoreLightStates).toHaveBeenCalled();
            expect(hueController.isCelebrating).toBe(false);
            jest.useRealTimers();
        });

        test('logs failures that occur while starting or running a celebration', async () => {
            hueController.connected = true;
            jest.spyOn(hueController, 'getGroupLights').mockRejectedValueOnce(new Error('group unavailable'));

            await hueController.celebrateDonation();

            expect(mockLogger.error).toHaveBeenCalledWith('Failed to start Hue celebration', {
                error: 'group unavailable'
            });
            expect(hueController.isCelebrating).toBe(false);

            jest.useFakeTimers();
            hueController.connected = true;
            hueController.api = mockApi;
            hueController.group = { lights: ['1'] };
            mockApi.lights.getLight.mockResolvedValue({ id: '1', state: { on: true, bri: 100 } });
            jest.spyOn(hueController, 'runCelebrationAnimation').mockRejectedValueOnce(new Error('animation failed'));
            await hueController.celebrateDonation();
            await Promise.resolve();

            expect(mockLogger.error).toHaveBeenCalledWith('Celebration animation failed', {
                error: 'animation failed'
            });
            jest.clearAllTimers();
            jest.useRealTimers();
        });

        test('runs animation frames until the duration expires', async () => {
            const now = jest.spyOn(Date, 'now')
                .mockReturnValueOnce(1000)
                .mockReturnValueOnce(1000)
                .mockReturnValueOnce(6000);
            jest.spyOn(hueController, 'flashLightsWithRandomColors').mockResolvedValue();
            jest.spyOn(hueController, 'sleep').mockResolvedValue();

            await hueController.runCelebrationAnimation([{ id: '1' }]);

            expect(hueController.flashLightsWithRandomColors).toHaveBeenCalledTimes(1);
            expect(hueController.sleep).toHaveBeenCalledWith(300);
            now.mockRestore();
        });

        test('flashes available lights and contains per-light failures', async () => {
            hueController.api = mockApi;
            jest.spyOn(Math, 'random').mockReturnValue(0);
            mockApi.lights.setLightState
                .mockResolvedValueOnce()
                .mockRejectedValueOnce(new Error('light offline'));

            await hueController.flashLightsWithRandomColors([{ id: '1' }, { id: '2' }]);

            expect(mockApi.lights.setLightState).toHaveBeenCalledTimes(2);
            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to flash light 2', { error: 'light offline' });
        });
    });
});
