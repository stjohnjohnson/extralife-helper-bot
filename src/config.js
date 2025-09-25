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
    const twitchEnvVars = ['TWITCH_CHANNEL', 'TWITCH_USERNAME', 'TWITCH_OAUTH'];
    const discordVoiceEnvVars = ['DISCORD_WAITING_ROOM_CHANNEL', 'DISCORD_LIVE_ROOM_CHANNEL'];


    // Check required variables
    const configErrors = requiredEnvVars
        .map(key => !process.env[key] ? `${key} is a required environment variable` : null)
        .filter(Boolean);

    // Check service configurations
    const discordConfigured = discordEnvVars.every(key => process.env[key]);
    const twitchConfigured = twitchEnvVars.every(key => process.env[key]);
    const discordVoiceConfigured = discordVoiceEnvVars.every(key => process.env[key]);

    // Parse admin users
    const discordAdmins = parseAdminUsers(process.env.DISCORD_ADMIN_USERS);
    const twitchAdmins = parseAdminUsers(process.env.TWITCH_ADMIN_USERS);

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
            oauth: process.env.TWITCH_OAUTH,
            channel: process.env.TWITCH_CHANNEL,
            admins: twitchAdmins
        }
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
    isAdmin
};
