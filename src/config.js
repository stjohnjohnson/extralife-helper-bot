const dotenv = require('dotenv');

// Only load .env file if not in test environment
if (process.env.NODE_ENV !== 'test') {
    dotenv.config();
}

/**
 * Validates and parses environment configuration
 * @returns {Object} Configuration object with validation results
 */
function parseConfiguration() {
    const requiredEnvVars = ['EXTRALIFE_PARTICIPANT_ID'];
    const discordEnvVars = ['DISCORD_SUMMARY_CHANNEL', 'DISCORD_DONATION_CHANNEL', 'DISCORD_TOKEN'];
    const twitchEnvVars = ['TWITCH_CHANNEL', 'TWITCH_USERNAME', 'TWITCH_CHAT_OAUTH', 'TWITCH_CLIENT_ID'];
    const discordVoiceEnvVars = ['DISCORD_WAITING_ROOM_CHANNEL', 'DISCORD_LIVE_ROOM_CHANNEL'];
    const gameUpdateEnvVars = ['DISCORD_GAME_UPDATE_USER_ID', 'TWITCH_CLIENT_SECRET', 'TWITCH_REFRESH_TOKEN'];

    // Check required variables
    const configErrors = requiredEnvVars
        .map(key => !process.env[key] ? `${key} is a required environment variable` : null)
        .filter(Boolean);

    // Check service configurations
    const discordConfigured = discordEnvVars.every(key => process.env[key]);
    const twitchConfigured = twitchEnvVars.every(key => process.env[key]);
    const discordVoiceConfigured = discordVoiceEnvVars.every(key => process.env[key]);
    const gameUpdateConfigured = gameUpdateEnvVars.every(key => process.env[key]) && discordConfigured && twitchConfigured;

    // Parse admin users
    const discordAdmins = parseAdminUsers(process.env.DISCORD_ADMIN_USERS);
    const twitchAdmins = parseAdminUsers(process.env.TWITCH_ADMIN_USERS);

    // Parse custom responses
    const { customResponses, customResponseErrors } = parseCustomResponses(process.env.CUSTOM_RESPONSES);
    configErrors.push(...customResponseErrors);

    // Validate at least one service is configured
    if (!discordConfigured && !twitchConfigured) {
        configErrors.push('At least one service must be configured (Discord or Twitch)');
        configErrors.push('Discord requires: ' + discordEnvVars.join(', '));
        configErrors.push('Twitch requires: ' + twitchEnvVars.join(', '));
    }

    return {
        isValid: configErrors.length === 0,
        errors: configErrors,
        participantId: process.env.EXTRALIFE_PARTICIPANT_ID,
        discord: {
            configured: discordConfigured,
            voiceConfigured: discordVoiceConfigured,
            token: process.env.DISCORD_TOKEN,
            donationChannel: process.env.DISCORD_DONATION_CHANNEL,
            summaryChannel: process.env.DISCORD_SUMMARY_CHANNEL,
            waitingRoomChannel: process.env.DISCORD_WAITING_ROOM_CHANNEL,
            liveRoomChannel: process.env.DISCORD_LIVE_ROOM_CHANNEL,
            admins: discordAdmins
        },
        twitch: {
            configured: twitchConfigured,
            username: process.env.TWITCH_USERNAME,
            chatOauth: process.env.TWITCH_CHAT_OAUTH,
            apiOauth: process.env.TWITCH_API_OAUTH,
            clientId: process.env.TWITCH_CLIENT_ID,
            clientSecret: process.env.TWITCH_CLIENT_SECRET,
            refreshToken: process.env.TWITCH_REFRESH_TOKEN,
            channel: process.env.TWITCH_CHANNEL,
            admins: twitchAdmins
        },
        gameUpdates: {
            configured: gameUpdateConfigured,
            userId: process.env.DISCORD_GAME_UPDATE_USER_ID,
            messageTemplate: process.env.DISCORD_GAME_UPDATE_MESSAGE || 'Now playing {game}!'
        },
        customResponses: customResponses
    };
}

/**
 * Parses admin users from comma-separated string
 * @param {string} adminString - Comma-separated admin users
 * @returns {string[]} Array of admin users
 */
function parseAdminUsers(adminString) {
    if (!adminString) return [];
    return adminString
        .split(',')
        .map(id => id.trim())
        .filter(Boolean);
}

/**
 * Parses custom responses from configuration string
 * @param {string} customResponseString - Format: 'command1:"response1",command2:"response2"'
 * @returns {Object} Object with customResponses map and errors array
 */
function parseCustomResponses(customResponseString) {
    const customResponses = new Map();
    const errors = [];
    const builtInCommands = ['goal', 'promote']; // List of built-in commands

    if (!customResponseString) {
        return { customResponses, customResponseErrors: errors };
    }

    try {
        // Split by comma, but be careful about commas inside quoted strings
        const pairs = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = '';

        for (let i = 0; i < customResponseString.length; i++) {
            const char = customResponseString[i];

            if ((char === '"' || char === '\'') && !inQuotes) {
                inQuotes = true;
                quoteChar = char;
                current += char;
            } else if (char === quoteChar && inQuotes) {
                inQuotes = false;
                quoteChar = '';
                current += char;
            } else if (char === ',' && !inQuotes) {
                if (current.trim()) {
                    pairs.push(current.trim());
                }
                current = '';
            } else {
                current += char;
            }
        }

        // Add the last pair
        if (current.trim()) {
            pairs.push(current.trim());
        }

        // Parse each pair
        for (const pair of pairs) {
            const colonIndex = pair.indexOf(':');
            if (colonIndex === -1) {
                errors.push(`Invalid custom response format: "${pair}". Expected format: command:"response"`);
                continue;
            }

            const command = pair.substring(0, colonIndex).trim().toLowerCase();
            const responseWithQuotes = pair.substring(colonIndex + 1).trim();

            // Remove quotes from response
            let response = responseWithQuotes;
            if ((response.startsWith('"') && response.endsWith('"')) ||
                (response.startsWith('\'') && response.endsWith('\''))) {
                response = response.slice(1, -1);
            }

            // Validate command name
            if (!command) {
                errors.push(`Empty command name in: "${pair}"`);
                continue;
            }

            if (!/^[a-z][a-z0-9]*$/.test(command)) {
                errors.push(`Invalid command name "${command}". Commands must start with a letter and contain only lowercase letters and numbers.`);
                continue;
            }

            // Check for conflicts with built-in commands
            if (builtInCommands.includes(command)) {
                errors.push(`Custom command "${command}" conflicts with built-in command. Please choose a different name.`);
                continue;
            }

            // Check for duplicates
            if (customResponses.has(command)) {
                errors.push(`Duplicate custom command "${command}" found.`);
                continue;
            }

            customResponses.set(command, response);
        }

    } catch (err) {
        errors.push(`Error parsing custom responses: ${err.message}`);
    }

    return { customResponses, customResponseErrors: errors };
}

/**
 * Checks if a user is an admin for the given platform
 * @param {string} platform - 'discord' or 'twitch'
 * @param {string} userId - User identifier
 * @param {Object} config - Configuration object
 * @returns {boolean} True if user is admin
 */
function isAdmin(platform, userId, config) {
    if (platform === 'discord') {
        return config.discord.admins.includes(userId);
    } else if (platform === 'twitch') {
        return config.twitch.admins.includes(userId.toLowerCase());
    }
    return false;
}

module.exports = {
    parseConfiguration,
    parseAdminUsers,
    parseCustomResponses,
    isAdmin
};
