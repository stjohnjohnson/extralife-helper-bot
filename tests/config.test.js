const { parseAdminUsers, isAdmin, parseConfiguration } = require('../src/config.js');

describe('Config Module', () => {
    describe('parseAdminUsers', () => {
        test('should parse comma-separated admin users', () => {
            const input = 'user1,user2,user3';
            const result = parseAdminUsers(input);
            expect(result).toEqual(['user1', 'user2', 'user3']);
        });

        test('should handle spaces around usernames', () => {
            const input = ' user1 , user2 , user3 ';
            const result = parseAdminUsers(input);
            expect(result).toEqual(['user1', 'user2', 'user3']);
        });

        test('should filter out empty values', () => {
            const input = 'user1,,user2,';
            const result = parseAdminUsers(input);
            expect(result).toEqual(['user1', 'user2']);
        });

        test('should return empty array for undefined input', () => {
            const result = parseAdminUsers(undefined);
            expect(result).toEqual([]);
        });

        test('should return empty array for empty string', () => {
            const result = parseAdminUsers('');
            expect(result).toEqual([]);
        });
    });

    describe('isAdmin', () => {
        const mockConfig = {
            discord: {
                admins: ['123456789', '987654321']
            },
            twitch: {
                admins: ['streamer1', 'mod1']
            }
        };

        test('should return true for Discord admin', () => {
            const result = isAdmin('discord', '123456789', mockConfig);
            expect(result).toBe(true);
        });

        test('should return false for non-Discord admin', () => {
            const result = isAdmin('discord', '111111111', mockConfig);
            expect(result).toBe(false);
        });

        test('should return true for Twitch admin (case insensitive)', () => {
            const result = isAdmin('twitch', 'STREAMER1', mockConfig);
            expect(result).toBe(true);
        });

        test('should return false for non-Twitch admin', () => {
            const result = isAdmin('twitch', 'randomuser', mockConfig);
            expect(result).toBe(false);
        });

        test('should return false for unknown platform', () => {
            const result = isAdmin('unknown', 'user123', mockConfig);
            expect(result).toBe(false);
        });
    });

    describe('parseConfiguration', () => {
        beforeEach(() => {
            jest.resetModules();
            // Clear all env vars except NODE_ENV
            Object.keys(process.env).forEach(key => {
                if (key !== 'NODE_ENV') {
                    delete process.env[key];
                }
            });
        });

        test('should return valid config when all required vars present', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            process.env.DISCORD_TOKEN = 'discord-token';
            process.env.DISCORD_DONATION_CHANNEL = '111111';
            process.env.DISCORD_SUMMARY_CHANNEL = '222222';

            const config = parseConfiguration();
            expect(config.isValid).toBe(true);
            expect(config.errors).toHaveLength(0);
            expect(config.participantId).toBe('12345');
            expect(config.discord.configured).toBe(true);
        });

        test('should return error when required vars missing', () => {
            delete process.env.EXTRALIFE_PARTICIPANT_ID;

            const config = parseConfiguration();
            expect(config.isValid).toBe(false);
            expect(config.errors).toContain('EXTRALIFE_PARTICIPANT_ID is a required environment variable');
        });

        test('should handle partial Discord configuration', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            process.env.DISCORD_TOKEN = 'discord-token';
            // Missing DISCORD_DONATION_CHANNEL and DISCORD_SUMMARY_CHANNEL

            const config = parseConfiguration();
            expect(config.discord.configured).toBe(false);
        });

        test('should parse admin users correctly', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            process.env.DISCORD_ADMIN_USERS = 'admin1,admin2';
            process.env.TWITCH_ADMIN_USERS = 'mod1,mod2';

            const config = parseConfiguration();
            expect(config.discord.admins).toEqual(['admin1', 'admin2']);
            expect(config.twitch.admins).toEqual(['mod1', 'mod2']);
        });

        test('should require at least one service configured', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            // No Discord or Twitch configuration

            const config = parseConfiguration();
            expect(config.isValid).toBe(false);
            expect(config.errors).toContain('At least one service must be configured (Discord or Twitch)');
        });

        test('should configure game updates when Discord, Twitch, and user ID are present', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            process.env.DISCORD_TOKEN = 'discord-token';
            process.env.DISCORD_DONATION_CHANNEL = '111111';
            process.env.DISCORD_SUMMARY_CHANNEL = '222222';
            process.env.TWITCH_CHANNEL = 'testchannel';
            process.env.TWITCH_USERNAME = 'testbot';
            process.env.TWITCH_CHAT_OAUTH = 'oauth:chat-token';
            process.env.TWITCH_CLIENT_ID = 'client-id';
            process.env.DISCORD_GAME_UPDATE_USER_ID = '987654321';
            process.env.TWITCH_API_OAUTH = 'oauth:api-token';

            const config = parseConfiguration();
            expect(config.gameUpdates.configured).toBe(true);
            expect(config.gameUpdates.userId).toBe('987654321');
            expect(config.gameUpdates.messageTemplate).toBe('Now playing {game}!');
        });

        test('should use custom message template when provided', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            process.env.DISCORD_TOKEN = 'discord-token';
            process.env.DISCORD_DONATION_CHANNEL = '111111';
            process.env.DISCORD_SUMMARY_CHANNEL = '222222';
            process.env.TWITCH_CHANNEL = 'testchannel';
            process.env.TWITCH_USERNAME = 'testbot';
            process.env.TWITCH_CHAT_OAUTH = 'oauth:chat-token';
            process.env.TWITCH_CLIENT_ID = 'client-id';
            process.env.DISCORD_GAME_UPDATE_USER_ID = '987654321';
            process.env.TWITCH_API_OAUTH = 'oauth:api-token';
            process.env.DISCORD_GAME_UPDATE_MESSAGE = 'Now playing: {game}';

            const config = parseConfiguration();
            expect(config.gameUpdates.messageTemplate).toBe('Now playing: {game}');
        });

        test('should not configure game updates when Discord is missing', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            process.env.TWITCH_CHANNEL = 'testchannel';
            process.env.TWITCH_USERNAME = 'testbot';
            process.env.TWITCH_CHAT_OAUTH = 'oauth:chat-token';
            process.env.TWITCH_CLIENT_ID = 'client-id';
            process.env.DISCORD_GAME_UPDATE_USER_ID = '987654321';
            process.env.TWITCH_API_OAUTH = 'oauth:api-token';
            // Missing Discord configuration

            const config = parseConfiguration();
            expect(config.gameUpdates.configured).toBe(false);
        });

        test('should not configure game updates when Twitch is missing', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            process.env.DISCORD_TOKEN = 'discord-token';
            process.env.DISCORD_DONATION_CHANNEL = '111111';
            process.env.DISCORD_SUMMARY_CHANNEL = '222222';
            process.env.DISCORD_GAME_UPDATE_USER_ID = '987654321';
            // Missing Twitch configuration

            const config = parseConfiguration();
            expect(config.gameUpdates.configured).toBe(false);
        });

        test('should not configure game updates when user ID is missing', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            process.env.DISCORD_TOKEN = 'discord-token';
            process.env.DISCORD_DONATION_CHANNEL = '111111';
            process.env.DISCORD_SUMMARY_CHANNEL = '222222';
            process.env.TWITCH_CHANNEL = 'testchannel';
            process.env.TWITCH_USERNAME = 'testbot';
            process.env.TWITCH_CHAT_OAUTH = 'oauth:chat-token';
            process.env.TWITCH_CLIENT_ID = 'client-id';
            process.env.TWITCH_API_OAUTH = 'oauth:api-token';
            // Missing DISCORD_GAME_UPDATE_USER_ID

            const config = parseConfiguration();
            expect(config.gameUpdates.configured).toBe(false);
        });
    });
});
