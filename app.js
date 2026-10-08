const { getUserDonations, getUserInfo } = require('extra-life-api');
const { Client: DiscordClient, GatewayIntentBits } = require('discord.js');
const tmi = require('tmi.js');
const getLogger = require('./logger.js');
const { parseConfiguration } = require('./src/config.js');
const { handleCommand } = require('./src/commands.js');
const { handlePresenceUpdate } = require('./src/gameUpdates.js');
const { startViewerCountMonitoring, stopViewerCountMonitoring } = require('./src/viewerMonitoring.js');
const { startVoiceMonitoring, stopVoiceMonitoring } = require('./src/voiceMonitoring.js');
const { startVoiceOverlay } = require('./src/voiceOverlay');
const { HueController } = require('./src/hueControl.js');
const { createStreamMarkerService } = require('./src/streamMarkers.js');
const { eventMetadata } = require('./src/analysis/eventMetadata.js');
const { taggedEmotes } = require('./src/analysis/emotes.js');

const log = getLogger('app');
const discordLog = getLogger('discord');
const twitchLog = getLogger('twitch');
const extralifeLog = getLogger('extralife');
const hueLog = getLogger('hue');
const moneyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

let runtime = null;
let stoppingPromise = null;

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
    if (!state.active || state.donationPollBusy) return;
    state.donationPollBusy = true;
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
                donation,
                discord: `${displayName} just donated ${amount}${donorMessage}!`,
                twitch: `ExtraLife ExtraLife ${displayName} just donated ${amount}${donorMessage}! ExtraLife ExtraLife`
            });
            extralifeLog.info(`Donation: ${displayName} / ${amount}${donorMessage}`, eventMetadata('donation', {
                donationId: donation.donationID,
                amount: Number(donation.amount),
                displayName,
                message: donation.message || '',
                silent
            }));
        });

        if (messages.length === 0 || silent) return;
        messages.forEach(message => { void state.streamMarkers.markDonation(message.donation); });
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
        extralifeLog.error('Error getting Donations', eventMetadata('service_error', {
            error: err.message
        }));
    } finally {
        state.donationPollBusy = false;
    }
}

function start({ config = parseConfiguration() } = {}) {
    if (runtime || stoppingPromise) throw new Error('Application already started');
    if (!config.isValid) throw new Error(`Invalid configuration:\n${config.errors.join('\n')}`);

    const state = {
        active: true,
        config,
        discordClient: null,
        twitchClient: null,
        hueController: null,
        hueInitialization: null,
        donationChannel: null,
        summaryChannel: null,
        donationInterval: null,
        donationPollBusy: false,
        streamMarkers: createStreamMarkerService(config, twitchLog),
        viewerCountInterval: null,
        summaryTimeouts: new Set(),
        seenDonationIDs: new Set(),
        voiceOverlay: null,
        voiceOverlayStartup: null,
        voiceOverlayAbort: new AbortController(),
        resolveReady: null
    };
    runtime = state;

    log.info(`ExtraLife Helper Bot starting for participant ${config.participantId}`);
    log.info('All services configured and enabled: Discord, Twitch, Voice, Game Updates, Hue');
    log.info(`Admin users: Discord=${config.discord.admins.length}, Twitch=${config.twitch.admins.length}`);

    state.hueController = new HueController(config, hueLog);
    state.hueInitialization = state.hueController.initialize()
        .then(success => {
            if (!state.active) return;
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
    const connectTwitch = state.twitchClient.connect.bind(state.twitchClient);
    state.twitchClient.connect = (...args) => {
        if (!state.active) return Promise.resolve();
        return connectTwitch(...args);
    };

    let resolveReady;
    let rejectReady;
    const readyPromise = new Promise((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
    });
    state.resolveReady = resolveReady;

    state.discordClient.once('ready', () => {
        if (!state.active) return;
        discordLog.info('Discord Bot Online');
        state.donationChannel = state.discordClient.channels.cache.get(config.discord.donationChannel);
        if (!state.donationChannel) {
            const error = new Error(`Unable to find donation channel with id ${config.discord.donationChannel}`);
            discordLog.error(error.message);
            rejectReady(error);
            return;
        }
        discordLog.info(`Found Discord Donation Channel: ${state.donationChannel.id}`);
        state.summaryChannel = state.discordClient.channels.cache.get(config.discord.summaryChannel);
        if (!state.summaryChannel) {
            const error = new Error(`Unable to find summary channel with id ${config.discord.summaryChannel}`);
            discordLog.error(error.message);
            rejectReady(error);
            return;
        }
        discordLog.info(`Found Discord Summary Channel: ${state.summaryChannel.id}`);
        state.voiceMonitor = startVoiceMonitoring(state.discordClient, state.donationChannel.guild, config, discordLog);
        if (config.voiceOverlay?.enabled) {
            state.voiceOverlayStartup = startVoiceOverlay({ client: state.discordClient, config,
                logger: discordLog, signal: state.voiceOverlayAbort.signal })
                .then(async service => {
                    if (!state.active) await service.stop();
                    else state.voiceOverlay = service;
                })
                .catch(error => discordLog.error('Unable to start voice overlay', { error: error.message }));
        }
        void updateDiscordSummary(state);
        resolveReady();
    });

    state.discordClient.on('messageCreate', async message => {
        if (!state.active || message.author.bot || !message.content.startsWith('!')) return;
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
            if (state.active && response) await message.reply(response);
        } catch (err) {
            discordLog.error('Error handling Discord command', { err });
        }
    });

    if (config.gameUpdates.userId) {
        state.discordClient.on('presenceUpdate', async (oldPresence, newPresence) => {
            if (!state.active) return;
            try {
                await handlePresenceUpdate(oldPresence, newPresence, config, state.twitchClient, discordLog);
            } catch (err) {
                discordLog.error('Error handling Discord presence update', { err });
            }
        });
        discordLog.info(`Game update monitoring enabled for user ${config.gameUpdates.userId}`);
    }

    const discordLogin = Promise.resolve()
        .then(() => state.discordClient.login(config.discord.token))
        .catch(err => {
            throw new Error(`Discord login failed: ${err.message}`);
        });

    state.twitchClient.on('message', async (channel, tags, message, self) => {
        if (!state.active || self) return;
        twitchLog.info('Chat message', eventMetadata('chat_message', {
            channel,
            userId: tags['user-id'] || tags.username,
            username: tags.username,
            displayName: tags['display-name'] || tags.username,
            text: message,
            emotes: taggedEmotes(message, tags.emotes),
            self: false
        }));
        if (!message.startsWith('!')) return;
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
            if (state.active && response) await state.twitchClient.say(channel, response);
        } catch (err) {
            twitchLog.error('Error handling Twitch command', { err });
        }
    });

    Promise.resolve()
        .then(() => state.twitchClient.connect())
        .catch(err => twitchLog.error('Error connecting to Twitch', { err }));
    twitchLog.info('Twitch Bot connecting...');
    state.donationInterval = setInterval(() => void getLatestDonation(state), 30000);
    void getLatestDonation(state, true);
    state.viewerCountInterval = startViewerCountMonitoring(config, twitchLog);

    return Promise.all([discordLogin, readyPromise])
        .then(() => undefined)
        .catch(async err => {
            await stop();
            throw err;
        });
}

async function stop() {
    if (stoppingPromise) return stoppingPromise;
    if (!runtime) return;
    const state = runtime;
    state.active = false;
    state.streamMarkers.stop();
    state.resolveReady();

    stoppingPromise = (async () => {
        if (state.donationInterval) clearInterval(state.donationInterval);
        state.summaryTimeouts.forEach(timeout => clearTimeout(timeout));
        state.summaryTimeouts.clear();
        const hueCleanup = Promise.resolve()
            .then(() => state.hueController?.stop())
            .catch(error => hueLog.error('Error stopping Hue controller', { error: error.message }));
        state.voiceOverlayAbort.abort();
        await state.voiceOverlayStartup;
        await state.voiceOverlay?.stop();
        stopVoiceMonitoring(state.voiceMonitor);
        if (state.viewerCountInterval) stopViewerCountMonitoring(state.viewerCountInterval, twitchLog);
        await Promise.all([state.hueInitialization, hueCleanup]);

        if (state.twitchClient) {
            state.twitchClient.reconnect = false;
            state.twitchClient.reconnecting = false;
        }

        const cleanupTasks = [];
        if (state.discordClient) {
            cleanupTasks.push(Promise.resolve()
                .then(() => state.discordClient.destroy())
                .catch(err => discordLog.error('Error disconnecting from Discord', { err })));
        }
        if (state.twitchClient) {
            cleanupTasks.push(Promise.resolve()
                .then(() => state.twitchClient.disconnect())
                .catch(err => twitchLog.error('Error disconnecting from Twitch', { err })));
        }
        await Promise.all(cleanupTasks);

        state.donationChannel = null;
        state.summaryChannel = null;
        state.seenDonationIDs.clear();
    })().finally(() => {
        if (runtime === state) runtime = null;
        stoppingPromise = null;
    });

    return stoppingPromise;
}

if (require.main === module) {
    const shutdown = async signal => {
        log.info(`Received ${signal}, shutting down gracefully...`);
        await stop();
        process.exit(0);
    };
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    process.once('SIGINT', () => void shutdown('SIGINT'));
    const run = async () => {
        try {
            await start();
        } catch (err) {
            log.error(err.message);
            await stop();
            process.exitCode = 1;
        }
    };
    void run();
}

module.exports = { start, stop };
