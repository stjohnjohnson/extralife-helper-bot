const { handleCommand, handleGoalCommand, handlePromoteCommand } = require('../src/commands.js');
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
                configured: true,
                voiceConfigured: true,
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

        test('should check Discord configuration', async () => {
            const unconfiguredConfig = {
                discord: { 
                    configured: false, 
                    voiceConfigured: false,
                    admins: ['admin1'] // Need to include admins array for isAdmin check
                }
            };

            const result = await handlePromoteCommand('discord', mockContext, unconfiguredConfig, {}, mockLogger);

            expect(result).toBe('Promote command not configured properly.');
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
                platform: 'discord',
                promoted: 2,
                totalInRoom: 2,
                executedBy: 'AdminUser'
            });
        });
    });

    describe('handleCommand', () => {
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
    });
});
