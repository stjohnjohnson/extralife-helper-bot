const { parseAdminUsers, isAdmin, parseConfiguration, parseCustomResponses } = require('../src/config.js');

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

    describe('parseCustomResponses', () => {
        test('should parse valid custom responses', () => {
            const input = 'donate:"Check out my donation link",discord:"Join our Discord server"';
            const result = parseCustomResponses(input);
            expect(result.customResponses.get('donate')).toBe('Check out my donation link');
            expect(result.customResponses.get('discord')).toBe('Join our Discord server');
            expect(result.customResponseErrors).toEqual([]);
        });

        test('should handle single quotes', () => {
            const input = 'donate:\'Check out my donation link\',discord:\'Join our Discord server\'';
            const result = parseCustomResponses(input);
            expect(result.customResponses.get('donate')).toBe('Check out my donation link');
            expect(result.customResponses.get('discord')).toBe('Join our Discord server');
            expect(result.customResponseErrors).toEqual([]);
        });

        test('should handle commas inside quoted responses', () => {
            const input = 'donate:"Hey there, check out my donation link!",info:"This is info, with commas, and more text"';
            const result = parseCustomResponses(input);
            expect(result.customResponses.get('donate')).toBe('Hey there, check out my donation link!');
            expect(result.customResponses.get('info')).toBe('This is info, with commas, and more text');
            expect(result.customResponseErrors).toEqual([]);
        });

        test('should normalize command names to lowercase', () => {
            const input = 'DONATE:"Check donation",Discord:"Join Discord"';
            const result = parseCustomResponses(input);
            expect(result.customResponses.get('donate')).toBe('Check donation');
            expect(result.customResponses.get('discord')).toBe('Join Discord');
            expect(result.customResponseErrors).toEqual([]);
        });

        test('should return empty map for undefined input', () => {
            const result = parseCustomResponses(undefined);
            expect(result.customResponses.size).toBe(0);
            expect(result.customResponseErrors).toEqual([]);
        });

        test('should return empty map for empty string', () => {
            const result = parseCustomResponses('');
            expect(result.customResponses.size).toBe(0);
            expect(result.customResponseErrors).toEqual([]);
        });

        test('should report error for invalid format', () => {
            const input = 'invalid_format_no_colon';
            const result = parseCustomResponses(input);
            expect(result.customResponses.size).toBe(0);
            expect(result.customResponseErrors).toHaveLength(1);
            expect(result.customResponseErrors[0]).toContain('Invalid custom response format');
        });

        test('should report error for empty command name', () => {
            const input = ':"some response"';
            const result = parseCustomResponses(input);
            expect(result.customResponses.size).toBe(0);
            expect(result.customResponseErrors).toHaveLength(1);
            expect(result.customResponseErrors[0]).toContain('Empty command name');
        });

        test('should report error for invalid command characters', () => {
            const input = 'donate-me:"Check out my donation link"';
            const result = parseCustomResponses(input);
            expect(result.customResponses.size).toBe(0);
            expect(result.customResponseErrors).toHaveLength(1);
            expect(result.customResponseErrors[0]).toContain('Invalid command name');
        });

        test('should report error for commands starting with number', () => {
            const input = '1donate:"Check out my donation link"';
            const result = parseCustomResponses(input);
            expect(result.customResponses.size).toBe(0);
            expect(result.customResponseErrors).toHaveLength(1);
            expect(result.customResponseErrors[0]).toContain('Invalid command name');
        });

        test('should report error for built-in command conflicts', () => {
            const input = 'goal:"Custom goal response",promote:"Custom promote response"';
            const result = parseCustomResponses(input);
            expect(result.customResponses.size).toBe(0);
            expect(result.customResponseErrors).toHaveLength(2);
            expect(result.customResponseErrors[0]).toContain('conflicts with built-in command');
            expect(result.customResponseErrors[1]).toContain('conflicts with built-in command');
        });

        test('should report error for duplicate commands', () => {
            const input = 'donate:"First response",donate:"Second response"';
            const result = parseCustomResponses(input);
            expect(result.customResponses.size).toBe(1);
            expect(result.customResponses.get('donate')).toBe('First response');
            expect(result.customResponseErrors).toHaveLength(1);
            expect(result.customResponseErrors[0]).toContain('Duplicate custom command');
        });

        test('should handle mixed valid and invalid commands', () => {
            const input = 'donate:"Valid response",goal:"Invalid built-in",validcmd:"Another valid"';
            const result = parseCustomResponses(input);
            expect(result.customResponses.size).toBe(2);
            expect(result.customResponses.get('donate')).toBe('Valid response');
            expect(result.customResponses.get('validcmd')).toBe('Another valid');
            expect(result.customResponseErrors).toHaveLength(1);
            expect(result.customResponseErrors[0]).toContain('conflicts with built-in command');
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

        test('should parse custom responses correctly', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            process.env.DISCORD_TOKEN = 'discord-token';
            process.env.DISCORD_DONATION_CHANNEL = '111111';
            process.env.DISCORD_SUMMARY_CHANNEL = '222222';
            process.env.CUSTOM_RESPONSES = 'donate:"Check out my donation link!",info:"This is some info"';

            const config = parseConfiguration();
            expect(config.isValid).toBe(true);
            expect(config.customResponses.get('donate')).toBe('Check out my donation link!');
            expect(config.customResponses.get('info')).toBe('This is some info');
            expect(config.customResponses.size).toBe(2);
        });

        test('should report errors for invalid custom responses', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            process.env.DISCORD_TOKEN = 'discord-token';
            process.env.DISCORD_DONATION_CHANNEL = '111111';
            process.env.DISCORD_SUMMARY_CHANNEL = '222222';
            process.env.CUSTOM_RESPONSES = 'goal:"This conflicts with built-in command"';

            const config = parseConfiguration();
            expect(config.isValid).toBe(false);
            expect(config.errors.length).toBeGreaterThan(0);
            expect(config.errors.some(error => error.includes('conflicts with built-in command'))).toBe(true);
        });
    });
});
