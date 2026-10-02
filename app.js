const { getUserDonations, getUserInfo } = require('extra-life-api');
const { Client: DiscordClient, GatewayIntentBits } = require('discord.js');
const tmi = require('tmi.js');
const getLogger = require('./logger.js');
const { parseConfiguration } = require('./src/config.js');
const { handleCommand } = require('./src/commands.js');
const { handlePresenceUpdate } = require('./src/gameUpdates.js');
const { startViewerCountMonitoring, stopViewerCountMonitoring } = require('./src/viewerMonitoring.js');
const { HueController } = require('./src/hueControl.js');

const log = getLogger('app');
const discordLog = getLogger('discord');
const twitchLog = getLogger('twitch');
const extralifeLog = getLogger('extralife');
const hueLog = getLogger('hue');
const moneyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

let runtime = null;

function updateDiscordSummary(state) {
    if (!state.active || !state.summaryChannel) return Promise.resolve();

    return getUserInfo(state.config.participantId)
        .then(data => {
            if (!state.active) return;
            const sumDonations = moneyFormatter.format(data.sumDonations);
            const percentComplete = Math.round(data.sumDonations / data.fundraisingGoal * 100);
            const summary = `${sumDonations} (${percentComplete}%) Raised`;
            discordLog.info(`Updating Discord status: "${summary}"`);
            return state.summaryChannel.setName(summary);
        })
        .catch(err => discordLog.error('Error updating Discord summary', { err }));
}

async function getLatestDonation(state, silent = false) {
    try {
        const data = await getUserDonations(state.config.participantId);
        if (!state.active) return;
        const messages = [];

        data.donations.forEach(donation => {
            if (state.seenDonationIDs.has(donation.donationID)) return;
            state.seenDonationIDs.add(donation.donationID);
            const amount = moneyFormatter.format(donation.amount);
            const displayName = donation.displayName || 'Anonymous';
            const donorMessage = donation.message ? ` with the message "${donation.message}"` : '';
            messages.unshift({
                discord: `${displayName} just donated ${amount}${donorMessage}!`,
                twitch: `ExtraLife ExtraLife ${displayName} just donated ${amount}${donorMessage}! ExtraLife ExtraLife`
            });
            extralifeLog.info(`Donation: ${displayName} / ${amount}${donorMessage}`);
        });

        if (messages.length === 0 || silent) return;
        if (state.donationChannel) messages.forEach(message => state.donationChannel.send(message.discord));
        if (state.twitchClient) {
            messages.forEach(message => state.twitchClient.say(state.config.twitch.channel, message.twitch));
        }
        state.hueController.celebrateDonation().catch(err => hueLog.error('Hue celebration failed', { err }));

        const timeout = setTimeout(() => {
            state.summaryTimeouts.delete(timeout);
            void updateDiscordSummary(state);
        }, 5000);
        state.summaryTimeouts.add(timeout);
    } catch (err) {
        extralifeLog.error('Error getting Donations', { err });
    }
}

function start({ config = parseConfiguration() } = {}) {
    if (runtime) throw new Error('Application already started');
    if (!config.isValid) throw new Error(`Invalid configuration:\n${config.errors.join('\n')}`);

    const state = {
        active: true,
        config,
        discordClient: null,
        twitchClient: null,
        hueController: null,
        donationChannel: null,
        summaryChannel: null,
        donationInterval: null,
        viewerCountInterval: null,
        summaryTimeouts: new Set(),
        seenDonationIDs: new Set()
    };
    runtime = state;

    log.info(`ExtraLife Helper Bot starting for participant ${config.participantId}`);
    log.info('All services configured and enabled: Discord, Twitch, Voice, Game Updates, Hue');
    log.info(`Admin users: Discord=${config.discord.admins.length}, Twitch=${config.twitch.admins.length}`);

    state.hueController = new HueController(config, hueLog);
    state.hueController.initialize()
        .then(success => {
            if (success) log.info('Hue Bridge connected and ready for celebrations');
            else log.warn('Hue Bridge connection failed - light celebrations will be skipped');
        })
        .catch(err => hueLog.error('Hue Bridge initialization failed', { err }));

    state.discordClient = new DiscordClient({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildPresences
        ]
    });
    state.twitchClient = new tmi.Client({
        options: { debug: true, messagesLogLevel: 'info' },
        connection: { reconnect: true, secure: true },
        identity: { username: config.twitch.username, password: config.twitch.chatOauth },
        channels: [config.twitch.channel]
    });

    state.discordClient.once('ready', () => {
        discordLog.info('Discord Bot Online');
        state.donationChannel = state.discordClient.channels.cache.get(config.discord.donationChannel);
        if (!state.donationChannel) {
            discordLog.error(`Unable to find donation channel with id ${config.discord.donationChannel}`);
            return;
        }
        discordLog.info(`Found Discord Donation Channel: ${state.donationChannel.id}`);
        state.summaryChannel = state.discordClient.channels.cache.get(config.discord.summaryChannel);
        if (!state.summaryChannel) {
            discordLog.error(`Unable to find summary channel with id ${config.discord.summaryChannel}`);
            return;
        }
        discordLog.info(`Found Discord Summary Channel: ${state.summaryChannel.id}`);
        void updateDiscordSummary(state);
    });

    state.discordClient.on('messageCreate', async message => {
        if (message.author.bot || !message.content.startsWith('!')) return;
        try {
            const response = await handleCommand(
                message.content.slice(1).toLowerCase(),
                'discord',
                { message, userId: message.author.id, username: message.author.username },
                config,
                { discord: state.discordClient },
                discordLog,
                state.hueController
            );
            if (response) await message.reply(response);
        } catch (err) {
            discordLog.error('Error handling Discord command', { err });
        }
    });

    if (config.gameUpdates.userId) {
        state.discordClient.on('presenceUpdate', async (oldPresence, newPresence) => {
            try {
                await handlePresenceUpdate(oldPresence, newPresence, config, state.twitchClient, discordLog);
            } catch (err) {
                discordLog.error('Error handling Discord presence update', { err });
            }
        });
        discordLog.info(`Game update monitoring enabled for user ${config.gameUpdates.userId}`);
    }

    Promise.resolve(state.discordClient.login(config.discord.token))
        .catch(err => discordLog.error('Error connecting to Discord', { err }));

    state.twitchClient.on('message', async (channel, tags, message, self) => {
        if (self || !message.startsWith('!')) return;
        try {
            const response = await handleCommand(
                message.slice(1).toLowerCase(),
                'twitch',
                {
                    channel,
                    tags,
                    userId: tags.username,
                    username: tags['display-name'] || tags.username
                },
                config,
                { discord: state.discordClient, twitch: state.twitchClient },
                twitchLog,
                state.hueController
            );
            if (response) await state.twitchClient.say(channel, response);
        } catch (err) {
            twitchLog.error('Error handling Twitch command', { err });
        }
    });

    state.twitchClient.connect().catch(err => twitchLog.error('Error connecting to Twitch', { err }));
    twitchLog.info('Twitch Bot connecting...');
    state.donationInterval = setInterval(() => void getLatestDonation(state), 30000);
    void getLatestDonation(state, true);
    state.viewerCountInterval = startViewerCountMonitoring(config, twitchLog, 5);
}

async function stop() {
    if (!runtime) return;
    const state = runtime;
    runtime = null;
    state.active = false;
    if (state.donationInterval) clearInterval(state.donationInterval);
    state.summaryTimeouts.forEach(timeout => clearTimeout(timeout));
    state.summaryTimeouts.clear();
    if (state.viewerCountInterval) stopViewerCountMonitoring(state.viewerCountInterval, twitchLog);
    if (state.discordClient) state.discordClient.destroy();
    if (state.twitchClient) {
        try {
            await state.twitchClient.disconnect();
        } catch (err) {
            twitchLog.error('Error disconnecting from Twitch', { err });
        }
    }
    state.donationChannel = null;
    state.summaryChannel = null;
    state.seenDonationIDs.clear();
}

if (require.main === module) {
    const shutdown = async signal => {
        log.info(`Received ${signal}, shutting down gracefully...`);
        await stop();
        process.exit(0);
    };
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    process.once('SIGINT', () => void shutdown('SIGINT'));
    try {
        start();
    } catch (err) {
        log.error(err.message);
        process.exitCode = 1;
    }
}

module.exports = { start, stop };
