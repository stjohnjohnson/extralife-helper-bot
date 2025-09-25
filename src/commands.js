const { getUserInfo } = require('extra-life-api');
const { isAdmin } = require('./config.js');

/**
 * Formats money amount using USD currency format
 */
const moneyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
});

/**
 * Handles cross-platform commands
 * @param {string} command - The command to execute
 * @param {string} platform - 'discord' or 'twitch'
 * @param {Object} context - Command context
 * @param {Object} config - Application configuration
 * @param {Object} clients - Discord and Twitch clients
 * @param {Object} logger - Logger instance
 * @returns {Promise<string|null>} Response message or null if command not found
 */
async function handleCommand(command, platform, context, config, clients, logger) {
    switch (command) {
    case 'goal':
        return await handleGoalCommand(config.participantId, logger);
        
    case 'promote':
        return await handlePromoteCommand(platform, context, config, clients, logger);
        
    default:
        return null; // Unknown command
    }
}

/**
 * Handles the !goal command
 * @param {string} participantId - ExtraLife participant ID
 * @param {Object} logger - Logger instance
 * @returns {Promise<string>} Goal information message
 */
async function handleGoalCommand(participantId, logger) {
    try {
        const data = await getUserInfo(participantId);
        const sumDonations = moneyFormatter.format(data.sumDonations);
        const fundraisingGoal = moneyFormatter.format(data.fundraisingGoal);
        const percentComplete = Math.round(data.sumDonations / data.fundraisingGoal * 100);
        
        const message = `${data.displayName} has raised ${sumDonations} out of ${fundraisingGoal} (${percentComplete}%)`;
        logger.info('Goal command executed', { message });
        return message;
    } catch (err) {
        logger.error('Error getting goal info', { error: err.message });
        return 'Sorry, unable to get goal information right now.';
    }
}

/**
 * Handles the !promote command
 * @param {string} platform - 'discord' or 'twitch'
 * @param {Object} context - Command context with userId and username
 * @param {Object} config - Application configuration
 * @param {Object} clients - Discord and Twitch clients
 * @param {Object} logger - Logger instance
 * @returns {Promise<string>} Promote command result
 */
async function handlePromoteCommand(platform, context, config, clients, logger) {
    // Check admin permissions
    if (!isAdmin(platform, context.userId, config)) {
        logger.warn('Unauthorized promote command attempt', { 
            platform, 
            userId: context.userId, 
            username: context.username 
        });
        return 'You do not have permission to use this command.';
    }

    if (!config.discord.configured || !config.discord.voiceConfigured) {
        return 'Promote command not configured properly.';
    }

    try {
        const waitingRoom = clients.discord.channels.cache.get(config.discord.waitingRoomChannel);
        const liveRoom = clients.discord.channels.cache.get(config.discord.liveRoomChannel);
        
        if (!waitingRoom || !liveRoom) {
            logger.warn('Voice channels not found for promote command');
            return 'Voice channels not found.';
        }

        const members = waitingRoom.members;
        if (members.size === 0) {
            return 'No one in the waiting room to promote.';
        }

        let promoted = 0;
        for (const [id, member] of members) {
            try {
                await member.voice.setChannel(liveRoom);
                promoted++;
            } catch (err) {
                logger.warn('Failed to move member', { memberId: id, error: err.message });
            }
        }

        const message = `Promoted ${promoted} member(s) to live chat!`;
        logger.info('Promote command executed', { 
            platform, 
            promoted, 
            totalInRoom: members.size,
            executedBy: context.username 
        });
        return message;
    } catch (err) {
        logger.error('Error executing promote command', { error: err.message });
        return 'Error executing promote command.';
    }
}

module.exports = {
    handleCommand,
    handleGoalCommand,
    handlePromoteCommand
};
