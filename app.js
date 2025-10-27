const { getUserDonations, getUserInfo } = require('extra-life-api');
const { Client: DiscordClient, GatewayIntentBits } = require('discord.js');
const tmi = require('tmi.js');
const getLogger = require('./logger.js');
const { parseConfiguration } = require('./src/config.js');
const { handleCommand } = require('./src/commands.js');
const { handlePresenceUpdate } = require('./src/gameUpdates.js');
const { startViewerCountMonitoring, stopViewerCountMonitoring } = require('./src/viewerMonitoring.js');

// Setup loggers
const log = getLogger('app');
const discordLog = getLogger('discord');
const twitchLog = getLogger('twitch');
const extralifeLog = getLogger('extralife');

// Parse and validate configuration
const config = parseConfiguration();

// Check for configuration errors
if (!config.isValid) {
    log.error(config.errors.join('\n'));
    process.exit(1);
}

log.info(`ExtraLife Helper Bot starting for participant ${config.participantId}`);
log.info('All services configured and enabled: Discord, Twitch, Voice, Game Updates');
log.info(`Admin users: Discord=${config.discord.admins.length}, Twitch=${config.twitch.admins.length}`);

// Setup a formatter
const moneyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
});

// Track all "seen" donations across both services
const seenDonationIDs = {};

// Viewer count monitoring interval
let viewerCountInterval = null;

// Discord setup
let discordClient, donationChannel, summaryChannel;

// Create Discord client with additional intents for voice, messages, and presence
discordClient = new DiscordClient({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences
    ]
});

// When the Discord client is ready
discordClient.once('ready', () => {
    discordLog.info('Discord Bot Online');

    // Find our channels
    donationChannel = discordClient.channels.cache.get(config.discord.donationChannel);
    if (!donationChannel) {
        throw new Error(`Unable to find donation channel with id ${config.discord.donationChannel}`);
    }
    discordLog.info(`Found Discord Donation Channel: ${donationChannel.id}`);

    summaryChannel = discordClient.channels.cache.get(config.discord.summaryChannel);
    if (!summaryChannel) {
        throw new Error(`Unable to find summary channel with id ${config.discord.summaryChannel}`);
    }
    discordLog.info(`Found Discord Summary Channel: ${summaryChannel.id}`);

    // Get latest info
    updateDiscordSummary();
});

// Handle Discord messages for commands
discordClient.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Handle commands
    if (message.content.startsWith('!')) {
        const command = message.content.slice(1).toLowerCase();
        const context = {
            message,
            userId: message.author.id,
            username: message.author.username
        };
        const clients = { discord: discordClient };
        const response = await handleCommand(command, 'discord', context, config, clients, discordLog);

        if (response) {
            message.reply(response);
        }
    }
});

// Handle Discord presence updates for game changes (if userId configured)
if (config.gameUpdates.userId) {
    discordClient.on('presenceUpdate', async (oldPresence, newPresence) => {
        await handlePresenceUpdate(oldPresence, newPresence, config, twitchClient, discordLog);
    });

    discordLog.info(`Game update monitoring enabled for user ${config.gameUpdates.userId}`);
}

// Login to Discord
discordClient.login(config.discord.token);

// Twitch setup
let twitchClient;

// Create Twitch client
twitchClient = new tmi.Client({
    options: { debug: true, messagesLogLevel: 'info' },
    connection: {
        reconnect: true,
        secure: true
    },
    identity: {
        username: config.twitch.username,
        password: config.twitch.chatOauth
    },
    channels: [config.twitch.channel]
});

// Connect to Twitch
twitchClient.connect().catch(err => {
    twitchLog.error('Error connecting to Twitch', { err });
});

// Listen for Twitch messages
twitchClient.on('message', async (channel, tags, message, self) => {
    // Ignore self
    if (self) return;

    // Handle commands
    if (message.startsWith('!')) {
        const command = message.slice(1).toLowerCase();
        const context = {
            channel,
            tags,
            userId: tags.username,
            username: tags['display-name'] || tags.username
        };
        const clients = { discord: discordClient, twitch: twitchClient };
        const response = await handleCommand(command, 'twitch', context, config, clients, twitchLog);

        if (response) {
            twitchClient.say(channel, response);
        }
    }
});

twitchLog.info('Twitch Bot connecting...');

// Unified donation checking function
function getLatestDonation(silent = false) {
    getUserDonations(process.env.EXTRALIFE_PARTICIPANT_ID).then(data => {
        const msgQueue = [];

        data.donations.forEach(donation => {
            if (seenDonationIDs[donation.donationID]) {
                return;
            }
            seenDonationIDs[donation.donationID] = true;

            const amount = moneyFormatter.format(donation.amount),
                displayName = donation.displayName ? donation.displayName : 'Anonymous',
                message = donation.message ? ` with the message "${donation.message}"` : '';

            // Prepare messages for each service
            const discordMessage = `${displayName} just donated ${amount}${message}!`;
            const twitchMessage = `ExtraLife ExtraLife ${displayName} just donated ${amount}${message}! ExtraLife ExtraLife`;

            msgQueue.unshift({ discord: discordMessage, twitch: twitchMessage });
            extralifeLog.info(`Donation: ${displayName} / ${amount}${message}`);
        });

        if (msgQueue.length > 0 && !silent) {
            // Send to Discord if configured
            if (config.discord.configured && donationChannel) {
                msgQueue.forEach(msg => donationChannel.send(msg.discord));
            }

            // Send to Twitch if configured
            if (config.twitch.configured && twitchClient) {
                msgQueue.forEach(msg => twitchClient.say(config.twitch.channel, msg.twitch));
            }

            // 5 seconds later, get the latest summary
            setTimeout(updateDiscordSummary, 5000);
        }
    }).catch(err => {
        extralifeLog.error('Error getting Donations', { err });
    });
}

// Function to update Discord summary channel
function updateDiscordSummary() {
    if (config.discord.configured && summaryChannel) {
        getUserInfo(config.participantId)
            .then(data => {
                const sumDonations = moneyFormatter.format(data.sumDonations),
                    percentComplete = Math.round(data.sumDonations / data.fundraisingGoal * 100),
                    summary = `${sumDonations} (${percentComplete}%) Raised`;

                discordLog.info(`Updating Discord status: "${summary}"`);
                return summaryChannel.setName(summary);
            })
            .catch(err => {
                discordLog.error('Error updating Discord summary', { err });
            });
    }
}

// Start checking for donations every 30 seconds
setInterval(getLatestDonation, 30000);
// Be quiet the first time to avoid duplicate notifications on restart
getLatestDonation(true);

// Start viewer count monitoring (every 5 minutes)
viewerCountInterval = startViewerCountMonitoring(config, twitchLog, 5);

// Handle graceful shutdown
process.on('SIGTERM', () => {
    log.info('Received SIGTERM, shutting down gracefully...');

    if (viewerCountInterval) {
        stopViewerCountMonitoring(viewerCountInterval, twitchLog);
    }

    if (discordClient) {
        discordClient.destroy();
    }

    if (twitchClient) {
        twitchClient.disconnect();
    }

    process.exit(0);
});

process.on('SIGINT', () => {
    log.info('Received SIGINT, shutting down gracefully...');

    if (viewerCountInterval) {
        stopViewerCountMonitoring(viewerCountInterval, twitchLog);
    }

    if (discordClient) {
        discordClient.destroy();
    }

    if (twitchClient) {
        twitchClient.disconnect();
    }

    process.exit(0);
});
