import { getUserInfo, getUserDonations } from 'extra-life-api';
import dotenv from 'dotenv';
import { Client as DiscordClient, GatewayIntentBits } from 'discord.js';
import tmi from 'tmi.js';
import getLogger from './logger.js';

// Load config from disk
dotenv.config();

// Setup loggers
const log = getLogger('app');
const discordLog = getLogger('discord');
const twitchLog = getLogger('twitch');
const extralifeLog = getLogger('extralife');

// Validate we have all the required variables
const requiredEnvVars = [
    'EXTRALIFE_PARTICIPANT_ID'  // Participant ID for Extra Life (required for both services)
];

// Optional Discord variables (Discord service is enabled if these are present)
const discordEnvVars = [
    'DISCORD_SUMMARY_CHANNEL',  // Discord channel ID for updating the title
    'DISCORD_DONATION_CHANNEL', // Discord channel ID for listing donations
    'DISCORD_TOKEN'             // Bot token to talk to Discord
];

// Optional Twitch variables (Twitch service is enabled if these are present)
const twitchEnvVars = [
    'TWITCH_CHANNEL',           // Twitch channel to sit in
    'TWITCH_USERNAME',          // Bot's username
    'TWITCH_OAUTH'              // OAuth token from https://twitchapps.com/tmi/
];

// Check required variables
const configErrors = requiredEnvVars.map(key => {
    if (!process.env[key]) {
        return `${key} is a required environment variable`;
    }
}).filter(Boolean);

// Check if at least one service is configured
const discordConfigured = discordEnvVars.every(key => process.env[key]);
const twitchConfigured = twitchEnvVars.every(key => process.env[key]);

if (!discordConfigured && !twitchConfigured) {
    configErrors.push('At least one service must be configured (Discord or Twitch)');
    configErrors.push('Discord requires: ' + discordEnvVars.join(', '));
    configErrors.push('Twitch requires: ' + twitchEnvVars.join(', '));
}

if (configErrors.length > 0) {
    log.error(configErrors.join('\n'));
    process.exit(1);
}

log.info(`ExtraLife Helper Bot starting for participant ${process.env.EXTRALIFE_PARTICIPANT_ID}`);
log.info(`Services enabled: Discord=${discordConfigured}, Twitch=${twitchConfigured}`);

// Setup a formatter
const moneyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
});

// Track all "seen" donations across both services
const seenDonationIDs = {};

// Discord setup
let discordClient, donationChannel, summaryChannel;

if (discordConfigured) {
    // Create Discord client
    discordClient = new DiscordClient({ intents: [GatewayIntentBits.Guilds] });

    // When the Discord client is ready
    discordClient.once('ready', () => {
        discordLog.info('Discord Bot Online');

        // Find our channels
        donationChannel = discordClient.channels.cache.get(process.env.DISCORD_DONATION_CHANNEL);
        if (!donationChannel) {
            throw new Error(`Unable to find donation channel with id ${process.env.DISCORD_DONATION_CHANNEL}`);
        }
        discordLog.info(`Found Discord Donation Channel: ${donationChannel.id}`);

        summaryChannel = discordClient.channels.cache.get(process.env.DISCORD_SUMMARY_CHANNEL);
        if (!summaryChannel) {
            throw new Error(`Unable to find summary channel with id ${process.env.DISCORD_SUMMARY_CHANNEL}`);
        }
        discordLog.info(`Found Discord Summary Channel: ${summaryChannel.id}`);
    });

    // Login to Discord
    discordClient.login(process.env.DISCORD_TOKEN);
}

// Twitch setup
let twitchClient;

if (twitchConfigured) {
    // Create Twitch client
    twitchClient = new tmi.Client({
        options: { debug: true, messagesLogLevel: 'info' },
        connection: {
            reconnect: true,
            secure: true
        },
        identity: {
            username: process.env.TWITCH_USERNAME,
            password: process.env.TWITCH_OAUTH
        },
        channels: [process.env.TWITCH_CHANNEL]
    });

    // Connect to Twitch
    twitchClient.connect().catch(err => {
        twitchLog.error('Error connecting to Twitch', { err });
    });

    // Listen for Twitch messages
    twitchClient.on('message', (channel, tags, message, self) => {
        // Ignore self
        if (self) return;

        switch (message.toLowerCase()) {
        case '!goal':
            getUserInfo(process.env.EXTRALIFE_PARTICIPANT_ID).then(data => {
                const sumDonations = moneyFormatter.format(data.sumDonations),
                    fundraisingGoal = moneyFormatter.format(data.fundraisingGoal),
                    percentComplete = Math.round(data.sumDonations / data.fundraisingGoal * 100);

                twitchClient.say(channel, `${data.displayName} has raised ${sumDonations} out of ${fundraisingGoal} (${percentComplete}%)`);
            }).catch(err => {
                twitchLog.error('Error getting User Info for Twitch goal command', { err });
            });
            break;
        }
    });

    twitchLog.info('Twitch Bot connecting...');
}

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
            if (discordConfigured && donationChannel) {
                msgQueue.forEach(msg => donationChannel.send(msg.discord));
            }

            // Send to Twitch if configured
            if (twitchConfigured && twitchClient) {
                msgQueue.forEach(msg => twitchClient.say(process.env.TWITCH_CHANNEL, msg.twitch));
            }
        }

        // Update Discord summary channel after any donations
        if (msgQueue.length > 0 && discordConfigured && summaryChannel) {
            getUserInfo(process.env.EXTRALIFE_PARTICIPANT_ID)
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
    }).catch(err => {
        extralifeLog.error('Error getting Donations', { err });
    });
}

// Start checking for donations every 30 seconds
setInterval(getLatestDonation, 30000);
// Be quiet the first time to avoid duplicate notifications on restart
getLatestDonation(true);

// Handle graceful shutdown
process.on('SIGTERM', () => {
    log.info('Received SIGTERM, shutting down gracefully...');
    
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
    
    if (discordClient) {
        discordClient.destroy();
    }
    
    if (twitchClient) {
        twitchClient.disconnect();
    }
    
    process.exit(0);
});
