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

            hueController.connected = true;
            hueController.api = mockApi;
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
});