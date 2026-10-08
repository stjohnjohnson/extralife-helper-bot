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
        test('reserves color even when chat lighting is disabled', () => {
            const result = parseCustomResponses('color:"a custom response"');
            expect(result.customResponses.has('color')).toBe(false);
            expect(result.customResponseErrors).toHaveLength(1);
            expect(result.customResponseErrors[0]).toContain('conflicts with built-in command');
        });
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

        test.each([undefined, '', '   '])('disables donation markers for unset/blank threshold %s', raw => {
            if (raw !== undefined) process.env.STREAM_MARKER_DONATION_THRESHOLD = raw;
            expect(parseConfiguration().streamMarkers.donationThresholdCents).toBeNull();
        });

        test.each([['100', 10000], ['25.50', 2550], ['0.01', 1], [' 100.00 ', 10000]])('parses USD threshold %s in cents', (raw, cents) => {
            process.env.STREAM_MARKER_DONATION_THRESHOLD = raw;
            expect(parseConfiguration().streamMarkers.donationThresholdCents).toBe(cents);
        });

        test.each(['0', '-1', 'NaN', 'Infinity', '1e2', '0x10', '100.001', 'one hundred', '9007199254740991'])('rejects invalid marker threshold %s', raw => {
            process.env.STREAM_MARKER_DONATION_THRESHOLD = raw;
            const config = parseConfiguration();
            expect(config.isValid).toBe(false);
            expect(config.errors).toContain('STREAM_MARKER_DONATION_THRESHOLD must be a positive USD amount with up to two decimal places');
        });

        test.each([[undefined, false], ['false', false], ['true', true]])('parses Hue chat opt-in %s', (flag, expected) => {
            if (flag !== undefined) process.env.HUE_CHAT_CONTROL_ENABLED = flag;
            expect(parseConfiguration().hue.chatControlEnabled).toBe(expected);
        });

        test.each(['', 'yes', '1', 'TRUE'])('rejects invalid Hue chat opt-in %s', flag => {
            process.env.HUE_CHAT_CONTROL_ENABLED = flag;
            expect(parseConfiguration().errors).toContain('HUE_CHAT_CONTROL_ENABLED must be true or false');
        });

        test('should return valid config when all required vars present', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            process.env.DISCORD_TOKEN = 'discord-token';
            process.env.DISCORD_DONATION_CHANNEL = '111111';
            process.env.DISCORD_SUMMARY_CHANNEL = '222222';
            process.env.DISCORD_WAITING_ROOM_CHANNEL = '333333';
            process.env.DISCORD_LIVE_ROOM_CHANNEL = '444444';
            process.env.TWITCH_USERNAME = 'testbot';
            process.env.TWITCH_CHAT_OAUTH = 'oauth:chat-token';
            process.env.TWITCH_CHANNEL = 'testchannel';
            process.env.TWITCH_CLIENT_ID = 'client-id';
            process.env.TWITCH_CLIENT_SECRET = 'client-secret';
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-token';
            process.env.DISCORD_GAME_UPDATE_USER_ID = '987654321';
            process.env.HUE_USERNAME = 'hue-username';
            process.env.HUE_IPADDRESS = '192.168.1.100';
            process.env.HUE_GROUPID = '1';

            const config = parseConfiguration();
            expect(config.isValid).toBe(true);
            expect(config.errors).toHaveLength(0);
            expect(config.participantId).toBe('12345');
            expect(config.discord.token).toBe('discord-token');
            expect(config.twitch.username).toBe('testbot');
            expect(config.hue.username).toBe('hue-username');
            expect(config.hue.ipAddress).toBe('192.168.1.100');
            expect(config.hue.groupId).toBe('1');
        });

        test('should return error when required vars missing', () => {
            delete process.env.EXTRALIFE_PARTICIPANT_ID;

            const config = parseConfiguration();
            expect(config.isValid).toBe(false);
            expect(config.errors).toContain('EXTRALIFE_PARTICIPANT_ID is a required environment variable');
        });

        test('should return error when Discord vars are missing', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            process.env.DISCORD_TOKEN = 'discord-token';
            // Missing required Discord channels

            const config = parseConfiguration();
            expect(config.isValid).toBe(false);
            expect(config.errors).toContain('DISCORD_DONATION_CHANNEL is a required environment variable');
        });

        test('should parse admin users correctly', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            process.env.DISCORD_ADMIN_USERS = 'admin1,admin2';
            process.env.TWITCH_ADMIN_USERS = 'mod1,mod2';

            const config = parseConfiguration();
            expect(config.discord.admins).toEqual(['admin1', 'admin2']);
            expect(config.twitch.admins).toEqual(['mod1', 'mod2']);
        });

        test('should require all services configured', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            // No Discord or Twitch configuration

            const config = parseConfiguration();
            expect(config.isValid).toBe(false);
            expect(config.errors).toContain('DISCORD_TOKEN is a required environment variable');
            expect(config.errors).toContain('TWITCH_USERNAME is a required environment variable');
        });

        test('should include game updates when all required vars are present', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            process.env.DISCORD_TOKEN = 'discord-token';
            process.env.DISCORD_DONATION_CHANNEL = '111111';
            process.env.DISCORD_SUMMARY_CHANNEL = '222222';
            process.env.DISCORD_WAITING_ROOM_CHANNEL = '333333';
            process.env.DISCORD_LIVE_ROOM_CHANNEL = '444444';
            process.env.TWITCH_CHANNEL = 'testchannel';
            process.env.TWITCH_USERNAME = 'testbot';
            process.env.TWITCH_CHAT_OAUTH = 'oauth:chat-token';
            process.env.TWITCH_CLIENT_ID = 'client-id';
            process.env.DISCORD_GAME_UPDATE_USER_ID = '987654321';
            process.env.TWITCH_CLIENT_SECRET = 'client-secret';
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-token';
            process.env.HUE_USERNAME = 'hue-username';
            process.env.HUE_IPADDRESS = '192.168.1.100';
            process.env.HUE_GROUPID = '1';

            const config = parseConfiguration();
            expect(config.isValid).toBe(true);
            expect(config.gameUpdates.userId).toBe('987654321');
            expect(config.gameUpdates.messageTemplate).toBe('Now playing {game}!');
        });

        test('should use custom message template when provided', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            process.env.DISCORD_TOKEN = 'discord-token';
            process.env.DISCORD_DONATION_CHANNEL = '111111';
            process.env.DISCORD_SUMMARY_CHANNEL = '222222';
            process.env.DISCORD_WAITING_ROOM_CHANNEL = '333333';
            process.env.DISCORD_LIVE_ROOM_CHANNEL = '444444';
            process.env.TWITCH_CHANNEL = 'testchannel';
            process.env.TWITCH_USERNAME = 'testbot';
            process.env.TWITCH_CHAT_OAUTH = 'oauth:chat-token';
            process.env.TWITCH_CLIENT_ID = 'client-id';
            process.env.DISCORD_GAME_UPDATE_USER_ID = '987654321';
            process.env.TWITCH_CLIENT_SECRET = 'client-secret';
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-token';
            process.env.HUE_USERNAME = 'hue-username';
            process.env.HUE_IPADDRESS = '192.168.1.100';
            process.env.HUE_GROUPID = '1';
            process.env.DISCORD_GAME_UPDATE_MESSAGE = 'Now playing: {game}';

            const config = parseConfiguration();
            expect(config.gameUpdates.messageTemplate).toBe('Now playing: {game}');
        });

        test('should fail validation when Discord vars are missing', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            process.env.TWITCH_CHANNEL = 'testchannel';
            process.env.TWITCH_USERNAME = 'testbot';
            process.env.TWITCH_CHAT_OAUTH = 'oauth:chat-token';
            process.env.TWITCH_CLIENT_ID = 'client-id';
            process.env.DISCORD_GAME_UPDATE_USER_ID = '987654321';
            process.env.TWITCH_CLIENT_SECRET = 'client-secret';
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-token';
            // Missing Discord configuration

            const config = parseConfiguration();
            expect(config.isValid).toBe(false);
            expect(config.errors).toContain('DISCORD_TOKEN is a required environment variable');
        });

        test('should fail validation when Twitch vars are missing', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            process.env.DISCORD_TOKEN = 'discord-token';
            process.env.DISCORD_DONATION_CHANNEL = '111111';
            process.env.DISCORD_SUMMARY_CHANNEL = '222222';
            process.env.DISCORD_WAITING_ROOM_CHANNEL = '333333';
            process.env.DISCORD_LIVE_ROOM_CHANNEL = '444444';
            process.env.DISCORD_GAME_UPDATE_USER_ID = '987654321';
            // Missing Twitch configuration

            const config = parseConfiguration();
            expect(config.isValid).toBe(false);
            expect(config.errors).toContain('TWITCH_USERNAME is a required environment variable');
        });

        test('should fail validation when game update user ID is missing', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            process.env.DISCORD_TOKEN = 'discord-token';
            process.env.DISCORD_DONATION_CHANNEL = '111111';
            process.env.DISCORD_SUMMARY_CHANNEL = '222222';
            process.env.DISCORD_WAITING_ROOM_CHANNEL = '333333';
            process.env.DISCORD_LIVE_ROOM_CHANNEL = '444444';
            process.env.TWITCH_CHANNEL = 'testchannel';
            process.env.TWITCH_USERNAME = 'testbot';
            process.env.TWITCH_CHAT_OAUTH = 'oauth:chat-token';
            process.env.TWITCH_CLIENT_ID = 'client-id';
            process.env.TWITCH_CLIENT_SECRET = 'client-secret';
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-token';
            // Missing DISCORD_GAME_UPDATE_USER_ID

            const config = parseConfiguration();
            expect(config.isValid).toBe(false);
            expect(config.errors).toContain('DISCORD_GAME_UPDATE_USER_ID is a required environment variable');
        });

        test('should parse custom responses correctly', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            process.env.DISCORD_TOKEN = 'discord-token';
            process.env.DISCORD_DONATION_CHANNEL = '111111';
            process.env.DISCORD_SUMMARY_CHANNEL = '222222';
            process.env.DISCORD_WAITING_ROOM_CHANNEL = '333333';
            process.env.DISCORD_LIVE_ROOM_CHANNEL = '444444';
            process.env.TWITCH_USERNAME = 'testbot';
            process.env.TWITCH_CHAT_OAUTH = 'oauth:chat-token';
            process.env.TWITCH_CHANNEL = 'testchannel';
            process.env.TWITCH_CLIENT_ID = 'client-id';
            process.env.TWITCH_CLIENT_SECRET = 'client-secret';
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-token';
            process.env.DISCORD_GAME_UPDATE_USER_ID = '987654321';
            process.env.HUE_USERNAME = 'hue-username';
            process.env.HUE_IPADDRESS = '192.168.1.100';
            process.env.HUE_GROUPID = '1';
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
            process.env.DISCORD_WAITING_ROOM_CHANNEL = '333333';
            process.env.DISCORD_LIVE_ROOM_CHANNEL = '444444';
            process.env.TWITCH_USERNAME = 'testbot';
            process.env.TWITCH_CHAT_OAUTH = 'oauth:chat-token';
            process.env.TWITCH_CHANNEL = 'testchannel';
            process.env.TWITCH_CLIENT_ID = 'client-id';
            process.env.TWITCH_CLIENT_SECRET = 'client-secret';
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-token';
            process.env.DISCORD_GAME_UPDATE_USER_ID = '987654321';
            process.env.CUSTOM_RESPONSES = 'goal:"This conflicts with built-in command"';

            const config = parseConfiguration();
            expect(config.isValid).toBe(false);
            expect(config.errors.length).toBeGreaterThan(0);
            expect(config.errors.some(error => error.includes('conflicts with built-in command'))).toBe(true);
        });

        test('should return error when Hue vars are missing', () => {
            process.env.EXTRALIFE_PARTICIPANT_ID = '12345';
            process.env.DISCORD_TOKEN = 'discord-token';
            process.env.DISCORD_DONATION_CHANNEL = '111111';
            process.env.DISCORD_SUMMARY_CHANNEL = '222222';
            process.env.DISCORD_WAITING_ROOM_CHANNEL = '333333';
            process.env.DISCORD_LIVE_ROOM_CHANNEL = '444444';
            process.env.TWITCH_USERNAME = 'testbot';
            process.env.TWITCH_CHAT_OAUTH = 'oauth:chat-token';
            process.env.TWITCH_CHANNEL = 'testchannel';
            process.env.TWITCH_CLIENT_ID = 'client-id';
            process.env.TWITCH_CLIENT_SECRET = 'client-secret';
            process.env.TWITCH_REFRESH_TOKEN = 'refresh-token';
            process.env.DISCORD_GAME_UPDATE_USER_ID = '987654321';
            // Missing HUE_USERNAME, HUE_IPADDRESS, HUE_GROUPID

            const config = parseConfiguration();
            expect(config.isValid).toBe(false);
            expect(config.errors).toContain('HUE_USERNAME is a required environment variable');
            expect(config.errors).toContain('HUE_IPADDRESS is a required environment variable');
            expect(config.errors).toContain('HUE_GROUPID is a required environment variable');
        });
    });
});

describe('optional voice overlay configuration', () => {
    let previous;
    beforeEach(() => {
        previous = { ...process.env };
        for (const key of ['VOICE_OVERLAY_ENABLED', 'VOICE_OVERLAY_HOST', 'VOICE_OVERLAY_PORT']) delete process.env[key];
    });
    afterEach(() => { process.env = previous; });
    test('defaults off with LAN defaults', () => {
        expect(parseConfiguration().voiceOverlay).toEqual({ enabled: false, host: '0.0.0.0', port: 3000 });
    });
    test('enabled defaults reuse existing channel and target configuration', () => {
        process.env.VOICE_OVERLAY_ENABLED = 'true';
        expect(parseConfiguration().voiceOverlay).toEqual({ enabled: true, host: '0.0.0.0', port: 3000 });
    });
    test('accepts explicit host and port', () => {
        Object.assign(process.env, { VOICE_OVERLAY_ENABLED: 'true', VOICE_OVERLAY_HOST: '127.0.0.1', VOICE_OVERLAY_PORT: '4321' });
        expect(parseConfiguration().voiceOverlay).toEqual({ enabled: true, host: '127.0.0.1', port: 4321 });
    });
    test.each(['0', '65536', '3.5', '', 'abc', '1e3'])('rejects invalid enabled port %s', value => {
        Object.assign(process.env, { VOICE_OVERLAY_ENABLED: 'true', VOICE_OVERLAY_PORT: value });
        expect(parseConfiguration().errors.some(error => error.startsWith('VOICE_OVERLAY_PORT'))).toBe(true);
    });
    test('rejects malformed enablement and empty enabled host', () => {
        process.env.VOICE_OVERLAY_ENABLED = 'yes';
        expect(parseConfiguration().errors.some(error => error.startsWith('VOICE_OVERLAY_ENABLED'))).toBe(true);
        Object.assign(process.env, { VOICE_OVERLAY_ENABLED: 'true', VOICE_OVERLAY_HOST: '' });
        expect(parseConfiguration().errors.some(error => error.startsWith('VOICE_OVERLAY_HOST'))).toBe(true);
    });
    test('disabled feature ignores unused invalid network settings', () => {
        Object.assign(process.env, { VOICE_OVERLAY_ENABLED: 'false', VOICE_OVERLAY_HOST: '', VOICE_OVERLAY_PORT: 'abc' });
        expect(parseConfiguration().errors.some(error => error.startsWith('VOICE_OVERLAY'))).toBe(false);
    });
});

test('sa cannot be shadowed by a custom response and Twitch admin logins ignore case', () => {
    const { parseCustomResponses, isAdmin } = require('../src/config');
    expect(parseCustomResponses('sa:"shadow"').customResponseErrors).toHaveLength(1);
    expect(isAdmin('twitch', 'admin', { twitch: { admins: ['AdMiN'] } })).toBe(true);
});
