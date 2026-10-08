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
    celebrateDonation: jest.fn().mockResolvedValue(),
    stop: jest.fn().mockResolvedValue()
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
    handlePresenceUpdate: jest.fn(),
    getValidAccessToken: jest.fn(),
    getBroadcasterIdFromChannel: jest.fn(),
    makeTwitchApiRequest: jest.fn()
}));

jest.mock('../src/viewerMonitoring.js', () => ({
    startViewerCountMonitoring: jest.fn(() => ({ viewerTimer: true })),
    stopViewerCountMonitoring: jest.fn()
}));

jest.mock('../src/voiceMonitoring.js', () => ({
    startVoiceMonitoring: jest.fn(() => ({ voiceTimer: true })),
    stopVoiceMonitoring: jest.fn()
}));

jest.mock('../src/hueControl.js', () => ({
    HueController: jest.fn(() => mockHueController)
}));

const { getUserDonations, getUserInfo } = require('extra-life-api');
const { Client: DiscordClient } = require('discord.js');
const tmi = require('tmi.js');
const { parseConfiguration } = require('../src/config.js');
const { handleCommand } = require('../src/commands.js');
const { handlePresenceUpdate, getValidAccessToken, getBroadcasterIdFromChannel, makeTwitchApiRequest } = require('../src/gameUpdates.js');
const { startViewerCountMonitoring, stopViewerCountMonitoring } = require('../src/viewerMonitoring.js');
const { HueController } = require('../src/hueControl.js');
const { startVoiceMonitoring, stopVoiceMonitoring } = require('../src/voiceMonitoring.js');
jest.mock('../src/voiceOverlay', () => ({ startVoiceOverlay: jest.fn() }));
const { startVoiceOverlay } = require('../src/voiceOverlay');
jest.mock('../src/streamAvatars', () => ({ startStreamAvatars: jest.fn() }), { virtual: true });
const { startStreamAvatars } = require('../src/streamAvatars');
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
        getValidAccessToken.mockResolvedValue('marker-token');
        getBroadcasterIdFromChannel.mockResolvedValue('streamer-id');
        makeTwitchApiRequest.mockResolvedValue({ data: [{ id: 'marker-id', position_seconds: 42, created_at: '2026-10-08T01:00:00Z' }] });
        getUserInfo.mockResolvedValue({ sumDonations: 500, fundraisingGoal: 1000 });
        mockDiscordClient.login.mockResolvedValue();
        mockDiscordClient.destroy.mockResolvedValue();
        mockTwitchClient.connect = jest.fn().mockResolvedValue();
        mockTwitchClient.connect.mockResolvedValue();
        mockTwitchClient.disconnect.mockResolvedValue();
        mockHueController.initialize.mockResolvedValue(true);
        mockHueController.stop.mockResolvedValue();
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
        expect(startViewerCountMonitoring).toHaveBeenCalledWith(validConfig, mockLogger, { onObservation: expect.any(Function) });
        expect(getUserDonations).toHaveBeenCalledWith('participant-1');
        expect(() => application.start({ config: validConfig })).toThrow('Application already started');
    });

    test('discovers Discord channels and updates the fundraising summary', async () => {
        const donationChannel = { id: 'donations', guild: { id: 'guild' }, send: jest.fn() };
        const summaryChannel = { id: 'summary', setName: jest.fn().mockResolvedValue() };
        mockDiscordClient.channels.cache.get.mockImplementation(id => ({ donations: donationChannel, summary: summaryChannel })[id]);

        application.start({ config: validConfig });
        registeredHandler(mockDiscordClient.once, 'ready')();
        await flushPromises();

        expect(getUserInfo).toHaveBeenCalledWith('participant-1');
        expect(summaryChannel.setName).toHaveBeenCalledWith('$500.00 (50%) Raised');
        expect(startVoiceMonitoring).toHaveBeenCalledWith(mockDiscordClient, donationChannel.guild, validConfig, mockLogger);
        await application.stop();
        expect(stopVoiceMonitoring).toHaveBeenCalledWith({ voiceTimer: true });
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
        const donationChannel = { id: 'donations', guild: { id: 'guild' }, send: jest.fn() };
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

    test('marks each qualifying new donation once, including a mixed batch, but skips startup history', async () => {
        const historic = { donationID: 'historic', amount: 1000, displayName: 'Earlier Donor' };
        getUserDonations.mockResolvedValueOnce({ donations: [historic] }).mockResolvedValue({ donations: [
            historic,
            { donationID: 'large', amount: 150, displayName: 'Full Name' },
            { donationID: 'small', amount: 99.99, displayName: 'Small Donor' },
            { donationID: 'boundary', amount: '100.00', displayName: '' }
        ] });
        application.start({ config: { ...validConfig, streamMarkers: { donationThresholdCents: 10000 } } });
        await jest.advanceTimersByTimeAsync(0);
        expect(makeTwitchApiRequest).not.toHaveBeenCalled();
        await jest.advanceTimersByTimeAsync(30000);
        expect(makeTwitchApiRequest).toHaveBeenCalledTimes(2);
        expect(makeTwitchApiRequest.mock.calls.map(call => call[1].body)).toEqual([
            { user_id: 'streamer-id', description: 'Donation: $100.00 from Anonymous' },
            { user_id: 'streamer-id', description: 'Donation: $150.00 from Full Name' }
        ]);
        expect(mockHueController.celebrateDonation).toHaveBeenCalledTimes(1);
        expect(mockTwitchClient.say).toHaveBeenCalledTimes(3);
        await jest.advanceTimersByTimeAsync(30000);
        expect(makeTwitchApiRequest).toHaveBeenCalledTimes(2);
    });

    test('disabled markers leave existing donation announcements active', async () => {
        getUserDonations.mockResolvedValueOnce({ donations: [] }).mockResolvedValue({ donations: [
            { donationID: 'd', amount: 1000, displayName: 'Donor' }
        ] });
        application.start({ config: validConfig });
        await jest.advanceTimersByTimeAsync(30000);
        expect(makeTwitchApiRequest).not.toHaveBeenCalled();
        expect(mockTwitchClient.say).toHaveBeenCalledTimes(1);
        expect(mockHueController.celebrateDonation).toHaveBeenCalledTimes(1);
    });

    test.each(['pending', 'failed'])('%s marker write does not delay chat, Hue, or summary refresh', async mode => {
        if (mode === 'pending') makeTwitchApiRequest.mockImplementation(() => new Promise(() => {}));
        else makeTwitchApiRequest.mockRejectedValue(Object.assign(new Error('rate limited'), { statusCode: 429 }));
        getUserDonations.mockResolvedValueOnce({ donations: [] }).mockResolvedValue({ donations: [
            { donationID: 'd', amount: 100, displayName: 'Donor' }
        ] });
        const donationChannel = { id: 'donations', guild: { id: 'guild' }, send: jest.fn() };
        const summaryChannel = { id: 'summary', setName: jest.fn().mockResolvedValue() };
        mockDiscordClient.channels.cache.get.mockImplementation(id => ({ donations: donationChannel, summary: summaryChannel })[id]);
        application.start({ config: { ...validConfig, streamMarkers: { donationThresholdCents: 10000 } } });
        registeredHandler(mockDiscordClient.once, 'ready')();
        await jest.advanceTimersByTimeAsync(30000);
        expect(makeTwitchApiRequest).toHaveBeenCalledTimes(1);
        expect(mockTwitchClient.say).toHaveBeenCalledTimes(1);
        expect(mockHueController.celebrateDonation).toHaveBeenCalledTimes(1);
        await jest.advanceTimersByTimeAsync(5000);
        expect(getUserInfo).toHaveBeenCalledTimes(2);
    });

    test('shutdown cancels a pending marker and prevents further writes', async () => {
        makeTwitchApiRequest.mockImplementation(() => new Promise(() => {}));
        getUserDonations.mockResolvedValueOnce({ donations: [] }).mockResolvedValue({ donations: [
            { donationID: 'd', amount: 100, displayName: 'Donor' }
        ] });
        application.start({ config: { ...validConfig, streamMarkers: { donationThresholdCents: 10000 } } });
        await jest.advanceTimersByTimeAsync(30000);
        expect(makeTwitchApiRequest).toHaveBeenCalledTimes(1);
        const signal = makeTwitchApiRequest.mock.calls[0][1].signal;
        await application.stop();
        expect(signal.aborted).toBe(true);
        await jest.advanceTimersByTimeAsync(60000);
        expect(makeTwitchApiRequest).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
    });

    test('failed startup donation fetch keeps the first successful load silent', async () => {
        const history = { donationID: 'history', amount: 500, displayName: 'Historic Donor' };
        getUserDonations.mockRejectedValueOnce(new Error('Extra Life unavailable'))
            .mockResolvedValueOnce({ donations: [history] })
            .mockResolvedValue({ donations: [history, { donationID: 'new', amount: 100, displayName: 'New Donor' }] });
        application.start({ config: { ...validConfig, streamMarkers: { donationThresholdCents: 10000 } } });
        await jest.advanceTimersByTimeAsync(30000);
        expect(makeTwitchApiRequest).not.toHaveBeenCalled();
        expect(mockTwitchClient.say).not.toHaveBeenCalled();
        await jest.advanceTimersByTimeAsync(30000);
        expect(makeTwitchApiRequest).toHaveBeenCalledTimes(1);
        expect(makeTwitchApiRequest.mock.calls[0][1].body.description).toBe('Donation: $100.00 from New Donor');
    });

    test('a slow silent startup load cannot race a live poll and mark history', async () => {
        const initial = deferred();
        getUserDonations.mockReturnValueOnce(initial.promise).mockResolvedValue({ donations: [
            { donationID: 'history', amount: 500, displayName: 'Historic Donor' }
        ] });
        application.start({ config: { ...validConfig, streamMarkers: { donationThresholdCents: 10000 } } });
        await jest.advanceTimersByTimeAsync(30000);
        expect(getUserDonations).toHaveBeenCalledTimes(1);
        initial.resolve({ donations: [{ donationID: 'history', amount: 500, displayName: 'Historic Donor' }] });
        await jest.advanceTimersByTimeAsync(30000);
        expect(makeTwitchApiRequest).not.toHaveBeenCalled();
        expect(mockTwitchClient.say).not.toHaveBeenCalled();
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
        expect(mockHueController.stop).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
    });

    test('waits for Hue initialization and cleanup before allowing restart', async () => {
        const initialization = deferred();
        const cleanup = deferred();
        mockHueController.initialize.mockReturnValueOnce(initialization.promise);
        mockHueController.stop.mockReturnValueOnce(cleanup.promise);
        application.start({ config: validConfig });
        let stopped = false;
        const stopping = application.stop().then(() => { stopped = true; });
        await flushPromises();
        expect(mockHueController.stop).toHaveBeenCalledTimes(1);
        expect(stopped).toBe(false);
        expect(() => application.start({ config: validConfig })).toThrow('Application already started');
        cleanup.resolve();
        await flushPromises();
        expect(stopped).toBe(false);
        initialization.resolve(false);
        await stopping;
        expect(stopped).toBe(true);
        expect(mockLogger.warn).not.toHaveBeenCalledWith('Hue Bridge connection failed - light celebrations will be skipped');
    });

    test('contains Hue cleanup failures while disconnecting chat clients', async () => {
        mockHueController.stop.mockRejectedValueOnce(new Error('cleanup failed'));
        application.start({ config: validConfig });
        await application.stop();
        expect(mockLogger.error).toHaveBeenCalledWith('Error stopping Hue controller', { error: 'cleanup failed' });
        expect(mockDiscordClient.destroy).toHaveBeenCalled();
        expect(mockTwitchClient.disconnect).toHaveBeenCalled();
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


describe('optional overlay application integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockDiscordClient.channels.cache.get.mockReturnValue({ id: 'channel', guild: { id: 'guild' }, setName: jest.fn().mockResolvedValue() });
    });
    afterEach(async () => { await application.stop(); });
    test('enabled overlay starts with Discord and closes before Discord destruction', async () => {
        const order = [];
        startVoiceOverlay.mockResolvedValue({ stop: jest.fn(async () => { order.push('overlay'); }) });
        mockDiscordClient.destroy.mockImplementation(async () => { order.push('discord'); });
        const startup = application.start({ config: { ...validConfig, voiceOverlay: { enabled: true } } });
        registeredHandler(mockDiscordClient.once, 'ready')();
        await startup; await flushPromises(); await application.stop();
        expect(startVoiceOverlay).toHaveBeenCalledWith(expect.objectContaining({ client: mockDiscordClient, signal: expect.any(AbortSignal) }));
        expect(order).toEqual(['overlay', 'discord']);
    });
    test('overlay startup failure is isolated from existing application services', async () => {
        startVoiceOverlay.mockRejectedValue(new Error('voice unavailable'));
        const startup = application.start({ config: { ...validConfig, voiceOverlay: { enabled: true } } });
        registeredHandler(mockDiscordClient.once, 'ready')();
        await startup; await flushPromises();
        expect(mockDiscordClient.destroy).not.toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith('Unable to start voice overlay', { error: 'voice unavailable' });
    });
    test('stop aborts an in-flight overlay startup and closes a late service', async () => {
        let finish; let signal;
        const service = { stop: jest.fn().mockResolvedValue() };
        startVoiceOverlay.mockImplementation(options => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); });
        const startup = application.start({ config: { ...validConfig, voiceOverlay: { enabled: true } } });
        registeredHandler(mockDiscordClient.once, 'ready')(); await startup;
        const stopping = application.stop();
        expect(signal.aborted).toBe(true); finish(service); await stopping;
        expect(service.stop).toHaveBeenCalledTimes(1);
    });
});

describe('optional Stream Avatars application lifecycle', () => {
    beforeEach(() => { jest.clearAllMocks(); mockDiscordClient.channels.cache.get.mockReturnValue({ id: 'channel', guild: { id: 'guild' }, setName: jest.fn().mockResolvedValue() }); });
    afterEach(async () => { await application.stop(); });
    test('starts before Discord ready, forwards observations, and stops cleanly', async () => {
        const service = { observeProduction: jest.fn().mockResolvedValue(), stop: jest.fn().mockResolvedValue() };
        startStreamAvatars.mockResolvedValue(service);
        const startup = application.start({ config: { ...validConfig, streamAvatars: { enabled: true, config: {} } } });
        await flushPromises(); expect(startStreamAvatars).toHaveBeenCalledTimes(1);
        const callback = startViewerCountMonitoring.mock.calls[0][2].onObservation;
        await callback({ status: 'offline', observedAtMs: 1 }); expect(service.observeProduction).toHaveBeenCalledTimes(1);
        registeredHandler(mockDiscordClient.once, 'ready')(); await startup; await application.stop();
        expect(service.stop).toHaveBeenCalledTimes(1);
        await callback({ status: 'offline', observedAtMs: 2 }); expect(service.observeProduction).toHaveBeenCalledTimes(1);
    });
    test('optional failure cannot stop existing services or expose secrets in log', async () => {
        startStreamAvatars.mockRejectedValue(new Error('secret token'));
        const startup = application.start({ config: { ...validConfig, streamAvatars: { enabled: true, config: {} } } });
        registeredHandler(mockDiscordClient.once, 'ready')(); await startup; await flushPromises();
        expect(mockDiscordClient.destroy).not.toHaveBeenCalled(); expect(mockLogger.error).toHaveBeenCalledWith('Stream Avatars unavailable');
    });
});

describe('Twitch avatar command and automatic live handoff', () => {
    beforeEach(() => { jest.clearAllMocks(); mockDiscordClient.channels.cache.get.mockReturnValue({ id: 'channel', guild: { id: 'guild' }, setName: jest.fn().mockResolvedValue() }); });
    afterEach(async () => { await application.stop(); });
    test('passes avatar service to Twitch commands and sends the live-stop notice only while active', async () => {
        const service = { observeProduction: jest.fn(), stop: jest.fn().mockResolvedValue() }; startStreamAvatars.mockResolvedValue(service);
        const startup = application.start({ config: { ...validConfig, streamAvatars: { enabled: true, config: {} } } });
        registeredHandler(mockDiscordClient.once, 'ready')(); await startup; await flushPromises();
        const tags = { username: 'streamer', id: 'message', 'tmi-sent-ts': String(Date.now()) };
        await registeredHandler(mockTwitchClient.on, 'message')('#channel-name', tags, '!sa status', false);
        expect(handleCommand.mock.calls.at(-1)[7]).toBe(service);
        const onStopped = startStreamAvatars.mock.calls[0][0].onRehearsalStopped;
        onStopped(); await flushPromises(); expect(mockTwitchClient.say).toHaveBeenCalledTimes(1);
        await application.stop(); onStopped(); expect(mockTwitchClient.say).toHaveBeenCalledTimes(1);
    });
});
