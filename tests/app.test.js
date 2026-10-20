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

const mockGetUserDonations = jest.fn().mockResolvedValue({ donations: [] });
const mockCheckpointFiles = new Map();
const mockCheckpointFs = {
    readFile: jest.fn(async file => {
        if (!mockCheckpointFiles.has(file)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        return mockCheckpointFiles.get(file);
    }),
    mkdir: jest.fn(),
    open: jest.fn(async file => ({
        writeFile: async contents => { mockCheckpointFiles.set(file, contents); },
        sync: async () => {}, close: async () => {}
    })),
    rename: jest.fn(async (from, to) => { mockCheckpointFiles.set(to, mockCheckpointFiles.get(from)); mockCheckpointFiles.delete(from); }),
    rm: jest.fn(async file => { mockCheckpointFiles.delete(file); })
};
jest.mock('../src/donations/replay', () => ({
    createDonationReplay: options => jest.requireActual('../src/donations/replay').createDonationReplay({ ...options, fs: mockCheckpointFs })
}));
jest.mock('../src/extralife', () => ({ ...jest.requireActual('../src/extralife'), getUserInfo: jest.fn() }));

// Keep the legacy notification fixtures while exercising the new shared poll boundary.
jest.mock('../src/donations/source', () => ({ createDonationSource: jest.fn(() => {
    const controller = new AbortController();
    return { async poll({ participantId, window, announcementCheckpoint, onAnnouncements }) {
        const data = await Promise.race([mockGetUserDonations(participantId), new Promise((resolve, reject) => controller.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))]);
        const index = announcementCheckpoint?.lastDonationId ? data.donations.findIndex(d => d.donationID === announcementCheckpoint.lastDonationId) : -1;
        await onAnnouncements({ donations: index < 0 ? data.donations : data.donations.slice(0, index), baseline: announcementCheckpoint === null });
        return { scan: window ? { complete: true, participantId, fromMs: window.fromMs, throughMs: window.throughMs, donations: [] } : null, campaign: null };
    }, readCampaign: jest.fn().mockResolvedValue(null), stop() { controller.abort(); } };
}) }));

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

const { getUserInfo } = require('../src/extralife');
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
const mockWebServer = { address: { port: 3000 }, stop: jest.fn().mockResolvedValue() };
jest.mock('../src/webServer', () => ({ startWebServer: jest.fn(async () => mockWebServer) }), { virtual: true });
const { startWebServer } = require('../src/webServer');
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
    const registration = emitter.mock.calls.findLast(([event]) => event === eventName);
    return registration && registration[1];
}

async function flushPromises() {
    for (let i = 0; i < 40; i++) await Promise.resolve();
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
        mockCheckpointFiles.clear();
        mockCheckpointFs.rename.mockImplementation(async (from, to) => { mockCheckpointFiles.set(to, mockCheckpointFiles.get(from)); mockCheckpointFiles.delete(from); });
        mockCheckpointFs.readFile.mockImplementation(async file => {
            if (!mockCheckpointFiles.has(file)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
            return mockCheckpointFiles.get(file);
        });
        parseConfiguration.mockReturnValue(validConfig);
        mockGetUserDonations.mockResolvedValue({ donations: [] });
        getValidAccessToken.mockResolvedValue('marker-token');
        getBroadcasterIdFromChannel.mockResolvedValue('streamer-id');
        makeTwitchApiRequest.mockResolvedValue({ data: [{ id: 'marker-id', position_seconds: 42, created_at: '2026-10-08T01:00:00Z' }] });
        getUserInfo.mockResolvedValue({ sumDonations: 500, fundraisingGoal: 1000 });
        const donationChannel = { id: 'donations', guild: { id: 'guild' }, send: jest.fn().mockResolvedValue() };
        const summaryChannel = { id: 'summary', setName: jest.fn().mockResolvedValue() };
        mockDiscordClient.channels.cache.get.mockImplementation(id => ({ donations: donationChannel, summary: summaryChannel })[id]);
        mockDiscordClient.login.mockImplementation(async () => { registeredHandler(mockDiscordClient.once, 'ready')(); });
        mockDiscordClient.destroy.mockResolvedValue();
        mockTwitchClient.connect = jest.fn().mockResolvedValue();
        mockTwitchClient.connect.mockResolvedValue();
        mockTwitchClient.disconnect.mockResolvedValue();
        mockTwitchClient.say.mockReset().mockResolvedValue();
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
        expect(startViewerCountMonitoring).toHaveBeenCalledWith(validConfig, mockLogger, { onObservation: expect.any(Function), onGameObservation: expect.any(Function) });
        expect(mockGetUserDonations).toHaveBeenCalledWith('participant-1');
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
            mockLogger,
            expect.any(Function)
        );
    });

    test('announces new donations once and schedules a summary refresh', async () => {
        const donationChannel = { id: 'donations', guild: { id: 'guild' }, send: jest.fn() };
        const summaryChannel = { id: 'summary', setName: jest.fn().mockResolvedValue() };
        mockDiscordClient.channels.cache.get.mockImplementation(id => ({ donations: donationChannel, summary: summaryChannel })[id]);
        mockGetUserDonations
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

    test('restart replays from the failed donation after saving each successful announcement', async () => {
        const file = require('node:path').resolve('data/donations/participant-1.json');
        mockCheckpointFiles.set(file, JSON.stringify({ version: 1, participantId: 'participant-1', lastDonationId: 'A' }));
        const donations = ['D', 'C', 'B', 'A'].map(donationID => ({ donationID, amount: 25, displayName: donationID }));
        mockGetUserDonations.mockResolvedValue({ donations });
        mockTwitchClient.say.mockImplementation(async (channel, text) => {
            if (text.includes(' C just')) throw new Error('Twitch disconnected');
        });
        await application.start({ config: validConfig }); await jest.advanceTimersByTimeAsync(0);
        expect(mockTwitchClient.say.mock.calls.map(([, text]) => text.match(/ ([BCD]) just/)[1])).toEqual(['B', 'C']);
        expect(JSON.parse(mockCheckpointFiles.get(file)).lastDonationId).toBe('B');
        await application.stop(); mockTwitchClient.say.mockReset().mockResolvedValue();
        await application.start({ config: validConfig }); await jest.advanceTimersByTimeAsync(0);
        expect(mockTwitchClient.say.mock.calls.map(([, text]) => text.match(/ ([BCD]) just/)[1])).toEqual(['C', 'D']);
        expect(JSON.parse(mockCheckpointFiles.get(file)).lastDonationId).toBe('D');
    });

    test('a failed Discord announcement blocks Twitch delivery and retries at the next poll', async () => {
        const channel = mockDiscordClient.channels.cache.get('donations');
        mockGetUserDonations.mockResolvedValueOnce({ donations: [] }).mockResolvedValue({ donations: [{ donationID: 'A', amount: 25 }] });
        channel.send.mockRejectedValueOnce(new Error('Discord disconnected')).mockResolvedValue();
        await application.start({ config: validConfig }); await jest.advanceTimersByTimeAsync(30000);
        expect(mockTwitchClient.say).not.toHaveBeenCalled();
        await jest.advanceTimersByTimeAsync(30000);
        expect(channel.send).toHaveBeenCalledTimes(2);
        expect(mockTwitchClient.say).toHaveBeenCalledTimes(1);
    });

    test('a checkpoint write failure retries only the unsaved donation and blocks later donations', async () => {
        mockGetUserDonations.mockResolvedValueOnce({ donations: [] }).mockResolvedValue({ donations: ['C', 'B'].map(donationID => ({ donationID, displayName: donationID })) });
        await application.start({ config: validConfig }); await jest.advanceTimersByTimeAsync(0);
        mockCheckpointFs.rename.mockRejectedValueOnce(new Error('disk full'));
        await jest.advanceTimersByTimeAsync(30000);
        expect(mockTwitchClient.say.mock.calls.map(([, text]) => text.match(/ ([BC]) just/)[1])).toEqual(['B']);
        await jest.advanceTimersByTimeAsync(30000);
        expect(mockTwitchClient.say.mock.calls.map(([, text]) => text.match(/ ([BC]) just/)[1])).toEqual(['B', 'B', 'C']);
    });

    test('replay waits for Discord readiness and Twitch connection', async () => {
        const file = require('node:path').resolve('data/donations/participant-1.json');
        mockCheckpointFiles.set(file, JSON.stringify({ version: 1, participantId: 'participant-1', lastDonationId: null }));
        const twitch = deferred();
        mockTwitchClient.connect.mockReturnValue(twitch.promise);
        mockDiscordClient.login.mockResolvedValue();
        mockGetUserDonations.mockResolvedValue({ donations: [{ donationID: 'A', amount: 25 }] });
        const startup = application.start({ config: validConfig });
        await jest.advanceTimersByTimeAsync(30000);
        expect(mockTwitchClient.say).not.toHaveBeenCalled();
        registeredHandler(mockDiscordClient.once, 'ready')(); await startup;
        await jest.advanceTimersByTimeAsync(0);
        expect(mockTwitchClient.say).not.toHaveBeenCalled();
        twitch.resolve(); await jest.advanceTimersByTimeAsync(30000);
        expect(mockTwitchClient.say).toHaveBeenCalledTimes(1);
    });

    test('malformed checkpoint state prevents polling and remains available for recovery', async () => {
        const file = require('node:path').resolve('data/donations/participant-1.json');
        mockCheckpointFiles.set(file, 'broken');
        await application.start({ config: validConfig }); await jest.advanceTimersByTimeAsync(30000);
        expect(mockGetUserDonations).not.toHaveBeenCalled();
        expect(mockTwitchClient.say).not.toHaveBeenCalled();
        expect(mockCheckpointFiles.get(file)).toBe('broken');
        expect(mockLogger.error).toHaveBeenCalledWith('Error getting Donations', expect.objectContaining({ error: expect.any(String) }));
    });

    test('shutdown does not wait for a wedged chat send or save its donation', async () => {
        mockGetUserDonations.mockResolvedValueOnce({ donations: [] }).mockResolvedValue({ donations: [{ donationID: 'A' }] });
        await application.start({ config: validConfig }); await jest.advanceTimersByTimeAsync(0);
        const delivery = deferred();
        mockTwitchClient.say.mockReturnValueOnce(delivery.promise);
        await jest.advanceTimersByTimeAsync(30000);
        await application.stop();
        delivery.resolve(); await jest.advanceTimersByTimeAsync(0);
        const file = require('node:path').resolve('data/donations/participant-1.json');
        expect(JSON.parse(mockCheckpointFiles.get(file)).lastDonationId).toBeNull();
        expect(jest.getTimerCount()).toBe(0);
    });

    test('marks each qualifying new donation once, including a mixed batch, but skips startup history', async () => {
        const historic = { donationID: 'historic', amount: 1000, displayName: 'Earlier Donor' };
        mockGetUserDonations.mockResolvedValueOnce({ donations: [historic] }).mockResolvedValue({ donations: [
            { donationID: 'large', amount: 150, displayName: 'Full Name' },
            { donationID: 'small', amount: 99.99, displayName: 'Small Donor' },
            { donationID: 'boundary', amount: '100.00', displayName: '' },
            historic
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

    test('hidden donation amount is omitted without suppressing notifications or Hue', async () => {
        mockGetUserDonations.mockResolvedValueOnce({ donations: [] }).mockResolvedValue({ donations: [{ donationID: 'hidden', amount: null, displayName: 'Donor' }] });
        application.start({ config: validConfig }); await jest.advanceTimersByTimeAsync(30000);
        expect(mockTwitchClient.say).toHaveBeenCalledWith('channel-name', 'ExtraLife ExtraLife Donor just donated! ExtraLife ExtraLife');
        expect(mockHueController.celebrateDonation).toHaveBeenCalledTimes(1);
    });

    test('campaign intake keeps first-page announcements ahead of delayed totals and hides storage details', async () => {
        const later = deferred(); const checkpoint = { epochId: 'epoch', participantId: '12', baselineNeeded: true };
        const service = { getPollCheckpoint: () => checkpoint, acceptObservation: jest.fn().mockRejectedValue(new Error('private store details')), stop: jest.fn().mockResolvedValue() };
        startStreamAvatars.mockResolvedValue(service);
        const source = { poll: jest.fn(), pollCampaignDonations: jest.fn().mockImplementationOnce(async ({ onAnnouncements, onDonations }) => {
            await onAnnouncements({ donations: [], baseline: true }); await onDonations({ donations: [], complete: false, throughMs: Date.now() }); return { donations: [], complete: true, throughMs: Date.now(), rawSeenIds: [], recordCount: 0 };
        }).mockImplementation(async ({ onAnnouncements, onDonations }) => {
            await onAnnouncements({ donations: [{ donationID: 'live', amount: 25 }], baseline: false }); await onDonations({ donations: [{id:'live',participantId:'12',createdAtMs:Date.now(),amountCents:2500}], complete: false, throughMs: Date.now() });
            return later.promise;
        }), readCampaign: jest.fn().mockResolvedValue(null), stop: jest.fn() };
        application.start({ config: { ...validConfig, streamAvatars: { enabled: true, config: {} } }, donationSource: source });
        await jest.advanceTimersByTimeAsync(0); await jest.advanceTimersByTimeAsync(30000);
        expect(source.pollCampaignDonations).toHaveBeenCalledTimes(2);
        expect(mockTwitchClient.say).toHaveBeenCalledTimes(1); expect(mockHueController.celebrateDonation).toHaveBeenCalledTimes(1);
        expect(service.acceptObservation).toHaveBeenCalledWith(expect.objectContaining({expectedEpochId:'epoch',donations:expect.arrayContaining([expect.objectContaining({id:'live'})])}));
        later.resolve({ donations: [], complete: true, throughMs: Date.now(), rawSeenIds: ['live'], recordCount: 1 }); await jest.advanceTimersByTimeAsync(0);
        expect(mockLogger.warn).toHaveBeenCalledWith('Stream Avatars donation accounting unavailable');
        expect(mockTwitchClient.say).toHaveBeenCalledTimes(1);
    });

    test.each(['chat', 'missing checkpoint'])('announcement %s failures preserve independent campaign completion and totals', async failure => {
        const service = {
            getPollCheckpoint: () => ({ epochId: 'epoch', participantId: 'participant-1', baselineNeeded: true, baselineAtMs: null, rawSeenDonationIds: [], recordCount: null }),
            acceptObservation: jest.fn().mockResolvedValue(), stop: jest.fn().mockResolvedValue()
        };
        startStreamAvatars.mockResolvedValue(service);
        const file = require('node:path').resolve('data/donations/participant-1.json');
        mockCheckpointFiles.set(file, JSON.stringify({ version: 1, participantId: 'participant-1', lastDonationId: failure === 'chat' ? null : 'gone' }));
        if (failure === 'chat') mockTwitchClient.say.mockRejectedValue(new Error('chat unavailable'));
        const fetch = jest.fn().mockImplementation(async url => ({ status: 200, headers: new Headers({ 'num-records': '1' }), json: async () => url.includes('/donations') ? [{ donationID: 'new', participantID: 'participant-1', amount: 25, createdDateUTC: new Date(Date.now() - 1000).toISOString() }] : { sumDonations: 25, fundraisingGoal: 500 } }));
        const source = jest.requireActual('../src/donations/source').createDonationSource({ fetch, requestGapMs: 0 });
        await application.start({ config: { ...validConfig, streamAvatars: { enabled: true, config: {} } }, donationSource: source });
        await jest.advanceTimersByTimeAsync(0);
        expect(service.acceptObservation).toHaveBeenCalledWith(expect.objectContaining({ complete: true, baseline: true }));
        expect(service.acceptObservation).toHaveBeenCalledWith(expect.objectContaining({ campaign: expect.objectContaining({ totalCents: 2500 }) }));
        expect(JSON.parse(mockCheckpointFiles.get(file)).lastDonationId).toBe(failure === 'chat' ? null : 'gone');
    });

    test('shutdown cancels source work and fences late campaign intake and requests', async () => {
        const later = deferred(); const checkpoint = { epochId: 'epoch', participantId: '12' };
        const service = { getPollCheckpoint: () => checkpoint, acceptObservation: jest.fn(), stop: jest.fn().mockResolvedValue() };
        startStreamAvatars.mockResolvedValue(service);
        const source = { pollCampaignDonations: jest.fn().mockResolvedValueOnce({complete:true,donations:[],rawSeenIds:[],recordCount:0,throughMs:Date.now()}).mockImplementation(() => later.promise), readCampaign: jest.fn().mockResolvedValue(null), stop: jest.fn() };
        application.start({ config: { ...validConfig, streamAvatars: { enabled: true, config: {} } }, donationSource: source });
        await jest.advanceTimersByTimeAsync(30000); service.acceptObservation.mockClear(); source.readCampaign.mockClear();
        const stopping = application.stop(); expect(source.stop).toHaveBeenCalledTimes(1);
        expect(source.pollCampaignDonations.mock.calls[1][0].signal.aborted).toBe(true);
        later.resolve({ complete: true, donations: [], throughMs: Date.now() }); await stopping;
        expect(service.acceptObservation).not.toHaveBeenCalled(); expect(source.readCampaign).not.toHaveBeenCalled();
    });

    test('disabled markers leave existing donation announcements active', async () => {
        mockGetUserDonations.mockResolvedValueOnce({ donations: [] }).mockResolvedValue({ donations: [
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
        mockGetUserDonations.mockResolvedValueOnce({ donations: [] }).mockResolvedValue({ donations: [
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
        mockGetUserDonations.mockResolvedValueOnce({ donations: [] }).mockResolvedValue({ donations: [
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
        mockGetUserDonations.mockRejectedValueOnce(new Error('Extra Life unavailable'))
            .mockResolvedValueOnce({ donations: [history] })
            .mockResolvedValue({ donations: [{ donationID: 'new', amount: 100, displayName: 'New Donor' }, history] });
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
        mockGetUserDonations.mockReturnValueOnce(initial.promise).mockResolvedValue({ donations: [
            { donationID: 'history', amount: 500, displayName: 'Historic Donor' }
        ] });
        application.start({ config: { ...validConfig, streamMarkers: { donationThresholdCents: 10000 } } });
        await jest.advanceTimersByTimeAsync(30000);
        expect(mockGetUserDonations).toHaveBeenCalledTimes(1);
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
        const service = { observeProduction: jest.fn().mockResolvedValue(), observeGame: jest.fn().mockResolvedValue(), stop: jest.fn().mockResolvedValue() };
        startStreamAvatars.mockResolvedValue(service);
        const startup = application.start({ config: { ...validConfig, streamAvatars: { enabled: true, config: {} } } });
        await flushPromises(); await flushPromises(); expect(startStreamAvatars).toHaveBeenCalledTimes(1);
        const callback = startViewerCountMonitoring.mock.calls[0][2].onObservation;
        await callback({ status: 'offline', observedAtMs: 1 }); expect(service.observeProduction).toHaveBeenCalledTimes(1);
        const onGame = startViewerCountMonitoring.mock.calls[0][2].onGameObservation;
        const game = { gameName: 'Minecraft', observedAtMs: 1, source: 'twitch' };
        await onGame(game); expect(service.observeGame).toHaveBeenCalledWith(game);
        await registeredHandler(mockDiscordClient.on, 'presenceUpdate')({}, { userId: 'discord-user' });
        const onCategory = handlePresenceUpdate.mock.calls.at(-1)[5];
        await onCategory({ ...game, source: 'discord-category' }); expect(service.observeGame).toHaveBeenCalledTimes(2);
        registeredHandler(mockDiscordClient.once, 'ready')(); await startup; await application.stop();
        expect(service.stop).toHaveBeenCalledTimes(1);
        await callback({ status: 'offline', observedAtMs: 2 }); expect(service.observeProduction).toHaveBeenCalledTimes(1);
        await onGame(game); await onCategory(game); expect(service.observeGame).toHaveBeenCalledTimes(2);
    });
    test('optional failure cannot stop existing services or expose secrets in log', async () => {
        startStreamAvatars.mockRejectedValue(new Error('secret token'));
        const startup = application.start({ config: { ...validConfig, streamAvatars: { enabled: true, config: {} } } });
        registeredHandler(mockDiscordClient.once, 'ready')(); await startup; await flushPromises();
        expect(mockDiscordClient.destroy).not.toHaveBeenCalled(); expect(mockLogger.error).toHaveBeenCalledWith('Stream Avatars unavailable');
    });
});

describe('Twitch avatar command forwarding', () => {
    beforeEach(() => { jest.clearAllMocks(); mockDiscordClient.channels.cache.get.mockReturnValue({ id: 'channel', guild: { id: 'guild' }, setName: jest.fn().mockResolvedValue() }); });
    afterEach(async () => { await application.stop(); });
    test('passes avatar service to Twitch commands without rehearsal controls', async () => {
        const service = { observeProduction: jest.fn(), stop: jest.fn().mockResolvedValue() }; startStreamAvatars.mockResolvedValue(service);
        const startup = application.start({ config: { ...validConfig, streamAvatars: { enabled: true, config: {} } } });
        registeredHandler(mockDiscordClient.once, 'ready')(); await startup; await flushPromises();
        const tags = { username: 'streamer', id: 'message', 'tmi-sent-ts': String(Date.now()) };
        await registeredHandler(mockTwitchClient.on, 'message')('#channel-name', tags, '!sa status', false);
        expect(handleCommand.mock.calls.at(-1)[7]).toBe(service);
        expect(startStreamAvatars.mock.calls[0][0]).not.toHaveProperty('onRehearsalStopped');
        await application.stop();
    });
});


describe('shared web listener application lifecycle', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockDiscordClient.login.mockReset().mockResolvedValue();
        startWebServer.mockResolvedValue(mockWebServer);
        mockTwitchClient.connect = jest.fn().mockResolvedValue();
        mockWebServer.stop.mockResolvedValue();
        startVoiceOverlay.mockResolvedValue({ stop: jest.fn().mockResolvedValue() });
        startStreamAvatars.mockResolvedValue({ stop: jest.fn().mockResolvedValue() });
        mockDiscordClient.channels.cache.get.mockReturnValue({ id: 'channel', guild: { id: 'guild' }, setName: jest.fn().mockResolvedValue() });
    });
    afterEach(async () => { await application.stop(); });
    const config = { ...validConfig, webServer: { host: '127.0.0.1', port: 3000, errors: [] }, voiceOverlay: { enabled: true }, streamAvatars: { enabled: true, config: {} } };
    test('both integrations receive the same single listener while avatars start before Discord ready', async () => {
        const startup = application.start({ config }); await flushPromises(); await flushPromises();
        expect(startWebServer).toHaveBeenCalledTimes(1);
        expect(startStreamAvatars).toHaveBeenCalledWith(expect.objectContaining({ webServer: mockWebServer }));
        expect(startVoiceOverlay).not.toHaveBeenCalled();
        registeredHandler(mockDiscordClient.once, 'ready')(); await startup; await flushPromises(); await flushPromises();
        expect(startVoiceOverlay).toHaveBeenCalledWith(expect.objectContaining({ webServer: mockWebServer }));
        await application.stop(); expect(mockWebServer.stop).toHaveBeenCalledTimes(1);
    });
    test.each(['voiceOverlay', 'streamAvatars'])('one enabled integration still starts one listener: %s', async enabled => {
        const startup = application.start({ config: { ...config, voiceOverlay: { enabled: enabled === 'voiceOverlay' }, streamAvatars: { enabled: enabled === 'streamAvatars', config: {} } } });
        registeredHandler(mockDiscordClient.once, 'ready')(); await startup; await flushPromises(); await flushPromises();
        expect(startWebServer).toHaveBeenCalledTimes(1);
        expect(startVoiceOverlay).toHaveBeenCalledTimes(enabled === 'voiceOverlay' ? 1 : 0);
        expect(startStreamAvatars).toHaveBeenCalledTimes(enabled === 'streamAvatars' ? 1 : 0);
    });
    test('disabled integrations do not open a listener', async () => {
        const startup = application.start({ config: validConfig }); registeredHandler(mockDiscordClient.once, 'ready')(); await startup;
        expect(startWebServer).not.toHaveBeenCalled();
    });
    test('bind failure disables web integrations while ordinary bot services continue', async () => {
        startWebServer.mockRejectedValue(new Error('EADDRINUSE secret'));
        const connect = mockTwitchClient.connect;
        const startup = application.start({ config }); registeredHandler(mockDiscordClient.once, 'ready')(); await startup;
        await flushPromises(); await flushPromises();
        expect(startVoiceOverlay).not.toHaveBeenCalled(); expect(startStreamAvatars).not.toHaveBeenCalled();
        expect(mockDiscordClient.destroy).not.toHaveBeenCalled(); expect(connect).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith('Web listener unavailable; web integrations disabled');
    });
    test('shutdown aborts pending listen and closes a late listener without starting integrations', async () => {
        const pending = deferred(); let signal;
        startWebServer.mockImplementation(options => { signal = options.signal; return pending.promise; });
        const startup = application.start({ config }); registeredHandler(mockDiscordClient.once, 'ready')(); await startup;
        const stopping = application.stop(); expect(signal.aborted).toBe(true);
        pending.resolve(mockWebServer); await stopping;
        expect(mockWebServer.stop).toHaveBeenCalledTimes(1);
        expect(startVoiceOverlay).not.toHaveBeenCalled(); expect(startStreamAvatars).not.toHaveBeenCalled();
    });
});
