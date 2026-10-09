const { handleCommand, handleGoalCommand, handlePromoteCommand, handleTestLightsCommand } = require('../src/commands.js');
const { getUserInfo } = require('extra-life-api');

// Mock the external API
jest.mock('extra-life-api');

describe('Commands Module', () => {
    const mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('handleGoalCommand', () => {
        test('should return formatted goal message', async () => {
            const mockData = {
                displayName: 'Test User',
                sumDonations: 1250.50,
                fundraisingGoal: 10000
            };

            getUserInfo.mockResolvedValue(mockData);

            const result = await handleGoalCommand('12345', mockLogger);

            expect(result).toBe('Test User has raised $1,250.50 out of $10,000.00 (13%)');
            expect(getUserInfo).toHaveBeenCalledWith('12345');
            expect(mockLogger.info).toHaveBeenCalledWith('Goal command executed', {
                eventVersion: 1,
                eventType: 'command',
                message: 'Test User has raised $1,250.50 out of $10,000.00 (13%)'
            });
        });

        test('should handle API errors gracefully', async () => {
            getUserInfo.mockRejectedValue(new Error('API Error'));

            const result = await handleGoalCommand('12345', mockLogger);

            expect(result).toBe('Sorry, unable to get goal information right now.');
            expect(mockLogger.error).toHaveBeenCalledWith('Error getting goal info', {
                error: 'API Error'
            });
        });

        test('should handle zero goal correctly', async () => {
            const mockData = {
                displayName: 'Test User',
                sumDonations: 100,
                fundraisingGoal: 0
            };

            getUserInfo.mockResolvedValue(mockData);

            const result = await handleGoalCommand('12345', mockLogger);

            expect(result).toBe('Test User has raised $100.00 out of $0.00 (Infinity%)');
        });
    });

    describe('handlePromoteCommand', () => {
        const mockConfig = {
            discord: {
                waitingRoomChannel: 'waiting-123',
                liveRoomChannel: 'live-456',
                admins: ['admin1']
            }
        };

        const mockContext = {
            userId: 'admin1',
            username: 'AdminUser'
        };

        test('should deny non-admin users', async () => {
            const nonAdminContext = { userId: 'regular-user', username: 'RegularUser' };

            const result = await handlePromoteCommand('discord', nonAdminContext, mockConfig, {}, mockLogger);

            expect(result).toBe('You do not have permission to use this command.');
            expect(mockLogger.warn).toHaveBeenCalledWith('Unauthorized promote command attempt', {
                platform: 'discord',
                userId: 'regular-user',
                username: 'RegularUser'
            });
        });

        test('should handle missing voice channels', async () => {
            const mockClients = {
                discord: {
                    channels: {
                        cache: {
                            get: jest.fn().mockReturnValue(null)
                        }
                    }
                }
            };

            const result = await handlePromoteCommand('discord', mockContext, mockConfig, mockClients, mockLogger);

            expect(result).toBe('Voice channels not found.');
            expect(mockLogger.warn).toHaveBeenCalledWith('Voice channels not found for promote command');
        });

        test('should handle empty waiting room', async () => {
            const mockWaitingRoom = {
                members: { size: 0 }
            };

            const mockClients = {
                discord: {
                    channels: {
                        cache: {
                            get: jest.fn((channelId) => {
                                if (channelId === 'waiting-123') return mockWaitingRoom;
                                if (channelId === 'live-456') return { id: 'live-456' };
                                return null;
                            })
                        }
                    }
                }
            };

            const result = await handlePromoteCommand('discord', mockContext, mockConfig, mockClients, mockLogger);

            expect(result).toBe('No one in the waiting room to promote.');
        });

        test('should successfully promote members', async () => {
            const mockMember1 = {
                voice: { setChannel: jest.fn().mockResolvedValue() }
            };
            const mockMember2 = {
                voice: { setChannel: jest.fn().mockResolvedValue() }
            };

            const mockWaitingRoom = {
                members: {
                    size: 2,
                    [Symbol.iterator]: function* () {
                        yield ['member1', mockMember1];
                        yield ['member2', mockMember2];
                    }
                }
            };

            const mockLiveRoom = { id: 'live-456' };

            const mockClients = {
                discord: {
                    channels: {
                        cache: {
                            get: jest.fn((channelId) => {
                                if (channelId === 'waiting-123') return mockWaitingRoom;
                                if (channelId === 'live-456') return mockLiveRoom;
                                return null;
                            })
                        }
                    }
                }
            };

            const result = await handlePromoteCommand('discord', mockContext, mockConfig, mockClients, mockLogger);

            expect(result).toBe('Promoted 2 member(s) to live chat!');
            expect(mockMember1.voice.setChannel).toHaveBeenCalledWith(mockLiveRoom);
            expect(mockMember2.voice.setChannel).toHaveBeenCalledWith(mockLiveRoom);
            expect(mockLogger.info).toHaveBeenCalledWith('Promote command executed', {
                eventVersion: 1,
                eventType: 'command',
                platform: 'discord',
                promoted: 2,
                totalInRoom: 2,
                executedBy: 'AdminUser'
            });
        });
    });

    describe('handleCommand', () => {
        test.each(['discord', 'twitch'])('routes color arguments for non-admins on %s', async platform => {
            const controller = { requestColor: jest.fn().mockResolvedValue({ status: 'applied' }) };
            const config = { hue: { chatControlEnabled: true }, discord: { admins: [] }, twitch: { admins: [] } };
            for (const input of ['LIGHTBLUE', '#112233', 'random']) {
                expect(await handleCommand(`COLOR   ${input}`, platform, { username: 'viewer' }, config, {}, mockLogger, controller)).toBeNull();
                expect(controller.requestColor).toHaveBeenLastCalledWith(input.toLowerCase());
            }
        });

        test('describes busy, cooldown, unavailable, invalid, and party results', async () => {
            const config = { hue: { chatControlEnabled: true } };
            const controller = { requestColor: jest.fn() };
            const run = () => handleCommand('color party', 'twitch', { username: 'viewer' }, config, {}, mockLogger, controller);
            controller.requestColor.mockResolvedValueOnce({ status: 'busy' });
            expect(await run()).toMatch(/busy/i);
            controller.requestColor.mockResolvedValueOnce({ status: 'cooldown', retryAfterMs: 1501 });
            expect(await run()).toMatch(/2 seconds/i);
            controller.requestColor.mockResolvedValueOnce({ status: 'unavailable' });
            expect(await run()).toMatch(/unavailable/i);
            controller.requestColor.mockResolvedValueOnce({ status: 'invalid' });
            expect(await run()).toContain('!color');
            controller.requestColor.mockResolvedValueOnce({ status: 'party' });
            expect(await run()).toMatch(/party started/i);
        });

        test('reports disabled control without requesting a light change', async () => {
            const controller = { requestColor: jest.fn() };
            const result = await handleCommand('color red', 'discord', {}, { hue: { chatControlEnabled: false } }, {}, mockLogger, controller);
            expect(result).toMatch(/disabled/i);
            expect(controller.requestColor).not.toHaveBeenCalled();
        });

        test('reports missing controller and unexpected bridge errors', async () => {
            const config = { hue: { chatControlEnabled: true } };
            expect(await handleCommand('color red', 'discord', {}, config, {}, mockLogger)).toMatch(/unavailable/i);
            const controller = { requestColor: jest.fn().mockRejectedValue(new Error('bridge failed')) };
            expect(await handleCommand('color red', 'twitch', {}, config, {}, mockLogger, controller)).toMatch(/unavailable/i);
        });

        test('routes missing and extra color arguments without changing legacy matching', async () => {
            const controller = { requestColor: jest.fn().mockResolvedValue({ status: 'invalid' }) };
            const config = { hue: { chatControlEnabled: true }, customResponses: new Map([['donate', 'donation link']]) };
            expect(await handleCommand('color', 'discord', {}, config, {}, mockLogger, controller)).toContain('!color');
            expect(controller.requestColor).toHaveBeenLastCalledWith('');
            expect(await handleCommand('color red blue', 'twitch', {}, config, {}, mockLogger, controller)).toContain('!color');
            expect(controller.requestColor).toHaveBeenLastCalledWith('red blue');
            expect(await handleCommand('colorful red', 'twitch', {}, config, {}, mockLogger, controller)).toBeNull();
            expect(await handleCommand('goal extra', 'discord', {}, config, {}, mockLogger, controller)).toBeNull();
            expect(await handleCommand('donate extra', 'discord', {}, config, {}, mockLogger, controller)).toBeNull();
            expect(await handleCommand('donate', 'discord', {}, config, {}, mockLogger, controller)).toBe('donation link');
        });
        test('should route goal command correctly', async () => {
            getUserInfo.mockResolvedValue({
                displayName: 'Test User',
                sumDonations: 500,
                fundraisingGoal: 1000
            });

            const result = await handleCommand('goal', 'discord', {}, { participantId: '12345' }, {}, mockLogger);

            expect(result).toBe('Test User has raised $500.00 out of $1,000.00 (50%)');
        });

        test('should return null for unknown commands', async () => {
            const result = await handleCommand('unknown', 'discord', {}, {}, {}, mockLogger);

            expect(result).toBeNull();
        });

        test('should handle custom responses', async () => {
            const customResponses = new Map();
            customResponses.set('donate', 'Check out my donation link!');
            customResponses.set('discord', 'Join our Discord server!');

            const config = {
                customResponses: customResponses
            };

            const context = { username: 'testuser' };

            const result = await handleCommand('donate', 'discord', context, config, {}, mockLogger);

            expect(result).toBe('Check out my donation link!');
            expect(mockLogger.info).toHaveBeenCalledWith('Custom command executed', {
                eventVersion: 1,
                eventType: 'command',
                command: 'donate',
                platform: 'discord',
                username: 'testuser'
            });
        });

        test('should handle custom responses case insensitively', async () => {
            const customResponses = new Map();
            customResponses.set('donate', 'Check out my donation link!');

            const config = {
                customResponses: customResponses
            };

            const context = { username: 'testuser' };

            const result = await handleCommand('DONATE', 'twitch', context, config, {}, mockLogger);

            expect(result).toBe('Check out my donation link!');
            expect(mockLogger.info).toHaveBeenCalledWith('Custom command executed', {
                eventVersion: 1,
                eventType: 'command',
                command: 'donate',
                platform: 'twitch',
                username: 'testuser'
            });
        });

        test('should prioritize built-in commands over custom responses', async () => {
            getUserInfo.mockResolvedValue({
                displayName: 'Test User',
                sumDonations: 500,
                fundraisingGoal: 1000
            });

            const customResponses = new Map();
            customResponses.set('goal', 'This should not be returned');

            const config = {
                participantId: '12345',
                customResponses: customResponses
            };

            const result = await handleCommand('goal', 'discord', {}, config, {}, mockLogger);

            expect(result).toBe('Test User has raised $500.00 out of $1,000.00 (50%)');
            // Should not log custom command execution
            expect(mockLogger.info).toHaveBeenCalledWith('Goal command executed', {
                eventVersion: 1,
                eventType: 'command',
                message: 'Test User has raised $500.00 out of $1,000.00 (50%)'
            });
        });

        test('should return null when no custom responses configured', async () => {
            const config = {
                customResponses: null
            };

            const result = await handleCommand('donate', 'discord', {}, config, {}, mockLogger);

            expect(result).toBeNull();
        });
    });

    describe('handleTestLightsCommand', () => {
        const mockConfig = {
            discord: { admins: ['admin123'] },
            twitch: { admins: ['admin_user'] }
        };

        const mockContext = {
            userId: 'admin123',
            username: 'admin_user'
        };

        test('should deny access to non-admin users', async () => {
            const nonAdminContext = {
                userId: 'regular_user',
                username: 'regular_user'
            };

            const result = await handleTestLightsCommand('discord', nonAdminContext, mockConfig, null, mockLogger);

            expect(result).toBe('You do not have permission to use this command.');
            expect(mockLogger.warn).toHaveBeenCalledWith('Unauthorized testlights command attempt', {
                platform: 'discord',
                userId: 'regular_user',
                username: 'regular_user'
            });
        });

        test('should handle missing Hue controller', async () => {
            const result = await handleTestLightsCommand('discord', mockContext, mockConfig, null, mockLogger);

            expect(result).toBe('Hue controller not available.');
            expect(mockLogger.warn).toHaveBeenCalledWith('Hue controller not available for testlights command');
        });

        test('should handle Hue connection test failure', async () => {
            const mockHueController = {
                celebrateDonation: jest.fn().mockRejectedValue(new Error('Bridge not found'))
            };

            const result = await handleTestLightsCommand('discord', mockContext, mockConfig, mockHueController, mockLogger);

            expect(result).toBe('Error testing Hue lights.');
            expect(mockLogger.error).toHaveBeenCalledWith('Error executing testlights command', {
                error: 'Bridge not found'
            });
        });

        test('should successfully test Hue lights', async () => {
            const mockHueController = {
                celebrateDonation: jest.fn().mockResolvedValue()
            };

            const result = await handleTestLightsCommand('discord', mockContext, mockConfig, mockHueController, mockLogger);

            expect(result).toBe('🎉 Testing Hue lights! Simulating a donation celebration...');
            expect(mockHueController.celebrateDonation).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith('Test lights command executed', {
                eventVersion: 1,
                eventType: 'command',
                platform: 'discord',
                executedBy: 'admin_user'
            });
        });

        test('should handle celebration failure', async () => {
            const mockHueController = {
                celebrateDonation: jest.fn().mockRejectedValue(new Error('Celebration failed'))
            };

            const result = await handleTestLightsCommand('discord', mockContext, mockConfig, mockHueController, mockLogger);

            expect(result).toBe('Error testing Hue lights.');
            expect(mockLogger.error).toHaveBeenCalledWith('Error executing testlights command', {
                error: 'Celebration failed'
            });
        });
    });
});

test('sa namespace routes Twitch controls while Discord and lookalike namespaces stay separate', async () => {
    const config = { twitch: { admins: ['admin'], channel: 'channel' } };
    const service = { dispatch: async () => ({ status: 'ok', message: 'Preview requested' }) };
    const context = { channel: '#channel', tags: { username: 'admin', id: 'router-id', 'tmi-sent-ts': String(Date.now()) } };
    expect(await handleCommand('sa hearts', 'twitch', context, config, {}, { info() {} }, null, service)).toBe('Preview requested');
    expect(await handleCommand('sa hearts', 'discord', {}, config, {}, { info() {} }, null, service)).toMatch(/Twitch/i);
    expect(await handleCommand('sail hearts', 'twitch', context, config, {}, { info() {} }, null, service)).toBeNull();
});
