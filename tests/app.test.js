const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

const mockDiscordClient = {
    once: jest.fn(),
    on: jest.fn(),
    login: jest.fn().mockResolvedValue(),
    destroy: jest.fn(),
    channels: { cache: { get: jest.fn() } }
};

const mockTwitchClient = {
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(),
    disconnect: jest.fn().mockResolvedValue(),
    say: jest.fn()
};

const mockHueController = {
    initialize: jest.fn().mockResolvedValue(true),
    celebrateDonation: jest.fn().mockResolvedValue()
};

jest.mock('extra-life-api', () => ({
    getUserDonations: jest.fn().mockResolvedValue({ donations: [] }),
    getUserInfo: jest.fn()
}));

jest.mock('discord.js', () => ({
    Client: jest.fn(() => mockDiscordClient),
    GatewayIntentBits: {
        Guilds: 1,
        GuildMessages: 2,
        MessageContent: 3,
        GuildVoiceStates: 4,
        GuildPresences: 5
    }
}));

jest.mock('tmi.js', () => ({
    Client: jest.fn(() => mockTwitchClient)
}));

jest.mock('../logger.js', () => jest.fn(() => mockLogger));

jest.mock('../src/config.js', () => ({
    parseConfiguration: jest.fn()
}));

jest.mock('../src/commands.js', () => ({
    handleCommand: jest.fn()
}));

jest.mock('../src/gameUpdates.js', () => ({
    handlePresenceUpdate: jest.fn()
}));

jest.mock('../src/viewerMonitoring.js', () => ({
    startViewerCountMonitoring: jest.fn(() => ({ viewerTimer: true })),
    stopViewerCountMonitoring: jest.fn()
}));

jest.mock('../src/hueControl.js', () => ({
    HueController: jest.fn(() => mockHueController)
}));

const { getUserDonations, getUserInfo } = require('extra-life-api');
const { Client: DiscordClient } = require('discord.js');
const tmi = require('tmi.js');
const { parseConfiguration } = require('../src/config.js');
const { handleCommand } = require('../src/commands.js');
const { handlePresenceUpdate } = require('../src/gameUpdates.js');
const { startViewerCountMonitoring, stopViewerCountMonitoring } = require('../src/viewerMonitoring.js');
const { HueController } = require('../src/hueControl.js');
const application = require('../app.js');

const validConfig = {
    isValid: true,
    errors: [],
    participantId: 'participant-1',
    discord: {
        token: 'discord-token',
        donationChannel: 'donations',
        summaryChannel: 'summary',
        admins: ['admin-1']
    },
    twitch: {
        username: 'streamer',
        chatOauth: 'oauth:test',
        channel: 'channel-name',
        admins: ['streamer']
    },
    gameUpdates: { userId: 'discord-user' }
};

function registeredHandler(emitter, eventName) {
    const registration = emitter.mock.calls.find(([event]) => event === eventName);
    return registration && registration[1];
}

async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

describe('application lifecycle', () => {
    beforeAll(() => {
        jest.useFakeTimers();
    });

    beforeEach(async () => {
        await application.stop();
        jest.clearAllMocks();
        parseConfiguration.mockReturnValue(validConfig);
        getUserDonations.mockResolvedValue({ donations: [] });
        getUserInfo.mockResolvedValue({ sumDonations: 500, fundraisingGoal: 1000 });
        mockDiscordClient.login.mockResolvedValue();
        mockDiscordClient.destroy.mockResolvedValue();
        mockTwitchClient.connect = jest.fn().mockResolvedValue();
        mockTwitchClient.connect.mockResolvedValue();
        mockTwitchClient.disconnect.mockResolvedValue();
        mockHueController.initialize.mockResolvedValue(true);
        mockHueController.celebrateDonation.mockResolvedValue();
        startViewerCountMonitoring.mockReturnValue({ viewerTimer: true });
    });

    afterEach(async () => {
        await application.stop();
        jest.clearAllTimers();
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    test('importing the module exposes lifecycle functions without starting services', () => {
        expect(application).toEqual({
            start: expect.any(Function),
            stop: expect.any(Function)
        });
        expect(parseConfiguration).not.toHaveBeenCalled();
        expect(DiscordClient).not.toHaveBeenCalled();
        expect(tmi.Client).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    });

    test('rejects invalid configuration before creating clients', () => {
        parseConfiguration.mockReturnValue({ isValid: false, errors: ['Missing Discord token'] });

        expect(() => application.start()).toThrow('Invalid configuration:\nMissing Discord token');
        expect(DiscordClient).not.toHaveBeenCalled();
        expect(tmi.Client).not.toHaveBeenCalled();
    });

    test('starts each service once and rejects a duplicate start', async () => {
        const connect = mockTwitchClient.connect;
        application.start();
        await flushPromises();

        expect(parseConfiguration).toHaveBeenCalledTimes(1);
        expect(DiscordClient).toHaveBeenCalledTimes(1);
        expect(mockDiscordClient.login).toHaveBeenCalledWith('discord-token');
        expect(tmi.Client).toHaveBeenCalledTimes(1);
        expect(connect).toHaveBeenCalledTimes(1);
        expect(HueController).toHaveBeenCalledWith(validConfig, mockLogger);
        expect(startViewerCountMonitoring).toHaveBeenCalledWith(validConfig, mockLogger, 5);
        expect(getUserDonations).toHaveBeenCalledWith('participant-1');
        expect(() => application.start({ config: validConfig })).toThrow('Application already started');
    });

    test('discovers Discord channels and updates the fundraising summary', async () => {
        const donationChannel = { id: 'donations', send: jest.fn() };
        const summaryChannel = { id: 'summary', setName: jest.fn().mockResolvedValue() };
        mockDiscordClient.channels.cache.get.mockImplementation(id => ({ donations: donationChannel, summary: summaryChannel })[id]);

        application.start({ config: validConfig });
        registeredHandler(mockDiscordClient.once, 'ready')();
        await flushPromises();

        expect(getUserInfo).toHaveBeenCalledWith('participant-1');
        expect(summaryChannel.setName).toHaveBeenCalledWith('$500.00 (50%) Raised');
    });

    test('rejects startup and cleans up when required Discord channels are missing', async () => {
        mockDiscordClient.channels.cache.get.mockReturnValue(undefined);
        const startup = application.start({ config: validConfig });

        expect(() => registeredHandler(mockDiscordClient.once, 'ready')()).not.toThrow();
        await expect(startup).rejects.toThrow('Unable to find donation channel with id donations');
        expect(mockDiscordClient.destroy).toHaveBeenCalled();
        expect(mockTwitchClient.disconnect).toHaveBeenCalled();
    });

    test('routes Discord and Twitch commands and ignores non-command messages', async () => {
        application.start({ config: validConfig });
        const discordHandler = registeredHandler(mockDiscordClient.on, 'messageCreate');
        const twitchHandler = registeredHandler(mockTwitchClient.on, 'message');
        const reply = jest.fn().mockResolvedValue();
        handleCommand.mockResolvedValueOnce('discord response').mockResolvedValueOnce('twitch response');

        await discordHandler({ author: { bot: false, id: 'user-1', username: 'User' }, content: '!GOAL', reply });
        await twitchHandler('#channel-name', { username: 'viewer', 'display-name': 'Viewer' }, '!GOAL', false);
        await discordHandler({ author: { bot: true }, content: '!goal' });
        await twitchHandler('#channel-name', {}, 'hello', false);

        expect(handleCommand).toHaveBeenCalledTimes(2);
        expect(reply).toHaveBeenCalledWith('discord response');
        expect(mockTwitchClient.say).toHaveBeenCalledWith('#channel-name', 'twitch response');
    });

    test('routes configured presence updates to the Twitch integration', async () => {
        application.start({ config: validConfig });
        const presenceHandler = registeredHandler(mockDiscordClient.on, 'presenceUpdate');
        const oldPresence = { userId: 'discord-user', activities: [] };
        const newPresence = { userId: 'discord-user', activities: [{ type: 0, name: 'Balatro' }] };

        await presenceHandler(oldPresence, newPresence);

        expect(handlePresenceUpdate).toHaveBeenCalledWith(
            oldPresence,
            newPresence,
            validConfig,
            mockTwitchClient,
            mockLogger
        );
    });

    test('announces new donations once and schedules a summary refresh', async () => {
        const donationChannel = { id: 'donations', send: jest.fn() };
        const summaryChannel = { id: 'summary', setName: jest.fn().mockResolvedValue() };
        mockDiscordClient.channels.cache.get.mockImplementation(id => ({ donations: donationChannel, summary: summaryChannel })[id]);
        getUserDonations
            .mockResolvedValueOnce({ donations: [] })
            .mockResolvedValue({ donations: [{ donationID: 'd-1', amount: 25, displayName: '', message: 'Great job' }] });

        application.start({ config: validConfig });
        registeredHandler(mockDiscordClient.once, 'ready')();
        await flushPromises();
        await jest.advanceTimersByTimeAsync(30000);

        expect(donationChannel.send).toHaveBeenCalledWith('Anonymous just donated $25.00 with the message "Great job"!');
        expect(mockTwitchClient.say).toHaveBeenCalledWith(
            'channel-name',
            'ExtraLife ExtraLife Anonymous just donated $25.00 with the message "Great job"! ExtraLife ExtraLife'
        );
        expect(mockHueController.celebrateDonation).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(5000);
        expect(getUserInfo).toHaveBeenCalledTimes(2);

        await jest.advanceTimersByTimeAsync(25000);
        expect(donationChannel.send).toHaveBeenCalledTimes(1);
    });

    test('rejects startup on Discord login failure and contains Twitch connection errors', async () => {
        const discordError = new Error('Discord unavailable');
        const twitchError = new Error('Twitch unavailable');
        mockDiscordClient.login.mockRejectedValueOnce(discordError);
        mockTwitchClient.connect.mockRejectedValueOnce(twitchError);

        const startup = application.start({ config: validConfig });
        await flushPromises();

        await expect(startup).rejects.toThrow('Discord login failed: Discord unavailable');
        expect(mockLogger.error).toHaveBeenCalledWith('Error connecting to Twitch', { err: twitchError });
    });

    test('stops timers and clients once even when stop is repeated', async () => {
        application.start({ config: validConfig });

        await application.stop();
        await application.stop();

        expect(stopViewerCountMonitoring).toHaveBeenCalledTimes(1);
        expect(stopViewerCountMonitoring).toHaveBeenCalledWith({ viewerTimer: true }, mockLogger);
        expect(mockDiscordClient.destroy).toHaveBeenCalledTimes(1);
        expect(mockTwitchClient.disconnect).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
    });

    test('waits for both client teardowns and blocks restart while stopping', async () => {
        const discordDestroy = deferred();
        const twitchDisconnect = deferred();
        mockDiscordClient.destroy.mockReturnValueOnce(discordDestroy.promise);
        mockTwitchClient.disconnect.mockReturnValueOnce(twitchDisconnect.promise);
        application.start({ config: validConfig });

        let stopped = false;
        const firstStop = application.stop().then(() => {
            stopped = true;
        });
        const secondStop = application.stop();
        await flushPromises();

        expect(stopped).toBe(false);
        expect(() => application.start({ config: validConfig })).toThrow('Application already started');
        discordDestroy.resolve();
        await flushPromises();
        expect(stopped).toBe(false);
        twitchDisconnect.resolve();
        await Promise.all([firstStop, secondStop]);
        expect(stopped).toBe(true);
    });

    test('fences reconnect callbacks and in-flight command replies after shutdown', async () => {
        const command = deferred();
        const reply = jest.fn().mockResolvedValue();
        handleCommand.mockReturnValueOnce(command.promise);
        const connect = mockTwitchClient.connect;
        application.start({ config: validConfig });
        const reconnectCallback = mockTwitchClient.connect;
        await flushPromises();
        const commandPromise = registeredHandler(mockDiscordClient.on, 'messageCreate')({
            author: { bot: false, id: 'user-1', username: 'User' },
            content: '!goal',
            reply
        });

        await application.stop();
        await reconnectCallback();
        command.resolve('late response');
        await commandPromise;

        expect(connect).toHaveBeenCalledTimes(1);
        expect(reply).not.toHaveBeenCalled();
    });
});
