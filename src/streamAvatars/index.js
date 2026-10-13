const { join } = require('node:path');
const { createSessionController } = require('../gameSession');
const { createSessionStore } = require('../gameSession/store');
const { validObservation, validGameObservation } = require('../gameSession/state');
const { loadThemeConfiguration, resolveGame, THEME_IDS } = require('./themes');
const { createHash } = require('node:crypto');
const { loadThemePack, BUNDLED_THEME_PACK_DIR } = require('./themeRelease');
const { publicCampaign } = require('./protocol');
const { createCampaignCelebrationComposer } = require('./celebrations');
const { createCampaignProgress } = require('./campaignProgress');
const { createCampaignStore } = require('./campaignStore');
const { startBridgeServer } = require('./server');
const { createEventDispatcher } = require('./events');
async function startStreamAvatars({ config, logger = { warn() {} }, signal, webServer, realClock = { nowMs: Date.now }, timers = { setTimeout, clearTimeout }, integration = null, themePackDir, candidatePackDir }) {
    const settings = config.streamAvatars.config, mode = integration ? 'integration' : 'production';
    if (candidatePackDir && !integration) throw new Error('Candidate packs require integration preview');
    if (candidatePackDir && themePackDir) throw new Error('Choose one theme pack');
    const directory = candidatePackDir || themePackDir || BUNDLED_THEME_PACK_DIR;
    const catalog = loadThemePack({ directory, previewOnly: Boolean(candidatePackDir && integration) }).catalog;
    const crowdIds = integration ? [...integration.crowdIds] : [], participantId = String(config.participantId), intervalCents = settings.donationIntervalCents ?? 50000;
    const progress = await createCampaignProgress({ store: createCampaignStore({ path: join(settings.stateDir, mode, 'campaign.json'), mode, participantId, intervalCents }),
        clock: realClock, mode, participantId, intervalCents });
    const themes = settings.themes || loadThemeConfiguration();
    for (const error of themes.errors) logger.warn(error);
    const cadenceMs = (config.twitch?.viewerSampleIntervalSeconds || 60) * 1000;
    const channel = config.twitch?.channel || 'integration';
    const gameSession = integration ? null : await createSessionController({
        store: createSessionStore({ path: join(settings.stateDir, 'production', 'state.json'), mode: 'production', channel }),
        clock: realClock, mode: 'production', channel, graceMs: 900000, cadenceMs, gameConfig: themes.enabled ? themes.config : null
    });
    let previewGame = null, reconciledGame = false, lastRealObservation = null, observationTail = Promise.resolve();
    const enqueueObservation = operation => {
        const result = observationTail.then(() => active ? operation() : undefined);
        observationTail = result.catch(() => {}); return result;
    };
    const currentGame = () => integration ? previewGame : gameSession.getSnapshot().game;
    const composer = createCampaignCelebrationComposer({ clock: realClock, ...(integration?.recognitionAction === 'jump' ? { random: () => 0 } : integration?.recognitionAction === 'hug' ? { random: () => 0.5 } : {}) });
    let server, events, stopping, phaseTimer = null, lastResolution = null, active = true, generation = 1;
    const snapshot = () => ({ version: 3, type: 'snapshot', mode, generation, serverNowMs: realClock.nowMs(), campaign: publicCampaign(progress.getSnapshot()),
        integration: { active: Boolean(integration), crowdIds },
        theme: themes.enabled && currentGame() ? { gameIdentity: currentGame().identity, gameName: currentGame().displayName, themeId: currentGame().themeId, packRevision: catalog.packRevision } : null,
        features: ['hearts','crowd','campaign','celebrations','donation-recognition', ...(themes.enabled ? ['themes'] : [])] });
    const cancelTimer = () => { if (phaseTimer !== null) timers.clearTimeout(phaseTimer); phaseTimer = null; };
    const discardVisuals = () => { cancelTimer(); composer.clear(); progress.clearConfirmations(); };
    const invalidate = () => { discardVisuals(); generation++; events?.clear({ mode, generation }); server?.send(snapshot()); };
    const notify = () => { if (active) server?.send(snapshot()); };
    const unsubscribe = progress.subscribe(notify);
    const unsubscribeGame = gameSession?.subscribe((state, change) => {
        notify();
        if (active && change?.announce) events?.publishGameEntrance({ mode, generation, campaignId: participantId, gameIdentity: state.game.identity, themeId: state.game.themeId });
    });
    const ready = () => Boolean(server?.getStatus().readyClients);
    const publish = messages => {
        if (!ready()) { discardVisuals(); return false; }
        let delivered = false;
        for (const message of messages) delivered = events.publishCelebration({ ...message, campaignId: participantId, mode, generation }) || delivered;
        if (messages.length && !delivered) discardVisuals();
        return delivered;
    };
    const arm = () => {
        cancelTimer(); const at = composer.nextTransitionAt();
        if (!active || at === null || !ready()) return;
        const token = generation;
        phaseTimer = timers.setTimeout(() => {
            phaseTimer = null;
            if (!active || generation !== token) return;
            try { publish(composer.advance()); arm(); }
            catch { invalidate(); logger.warn('Stream Avatars celebration sequencing failed'); }
        }, Math.max(0, at - realClock.nowMs()));
        phaseTimer?.unref?.();
    };
    const stop = () => {
        if (!stopping) stopping = (async () => {
            active = false; signal?.removeEventListener('abort', abort); cancelTimer(); composer.stop(); unsubscribe(); unsubscribeGame?.(); events?.clear({ mode, generation: ++generation });
            await server?.drain(); events?.stop(); await server?.stop(); await progress.stop(); await observationTail; await gameSession?.stop();
        })(); return stopping;
    };
    const abort = () => { void stop(); };
    try {
        if (signal?.aborted) throw new Error('Stream Avatars startup aborted');
        events = createEventDispatcher({ realClock, send: message => server?.send(message) || false });
        server = await startBridgeServer({ config: { ...settings, ...config.webServer }, webServer, getSnapshot: snapshot, logger, clock: realClock,
            onLastReadyDisconnect: () => { if (active) invalidate(); },
            onClientMessage: async message => {
                if (message.type === 'ready') lastResolution = message.resolution;
                if (message.type === 'diagnostic') logger.warn('Stream Avatars companion diagnostic', { code: message.code });
            } });
        if (signal?.aborted) throw new Error('Stream Avatars startup aborted');
        signal?.addEventListener('abort', abort, { once: true });
    } catch (error) { await stop(); throw error; }
    return { address: server.address, getPollCheckpoint: () => active ? progress.getPollCheckpoint() : null,
        previewGame({ theme, gameName, announce = true }) { return enqueueObservation(async () => {
            if (!integration || !themes.enabled) throw new Error('Theme preview unavailable');
            if ((theme === undefined) === (gameName === undefined)) throw new Error('Choose a theme or game');
            const game = gameName !== undefined ? resolveGame(gameName, themes.config) : [...THEME_IDS, 'neutral'].includes(theme) ? {
                identity: createHash('sha256').update('integration-theme:' + theme).digest('hex'),
                displayName: theme === 'neutral' ? 'Just Chatting' : theme, themeId: theme === 'neutral' ? null : theme
            } : null;
            if (!game) throw new Error('Invalid integration theme or game');
            if (previewGame?.identity === game.identity) return { changed: false, delivered: false };
            previewGame = game; notify();
            return { changed: true, delivered: announce && events.publishGameEntrance({ mode, generation, campaignId: participantId, gameIdentity: game.identity, themeId: game.themeId }) };
        }); },
        observeProduction(observation) { return enqueueObservation(async () => {
            if (integration || !validObservation(observation)) return;
            const latestAt = Math.max(lastRealObservation?.observedAtMs ?? -1, gameSession.getSnapshot().latestObservation?.observedAtMs ?? -1);
            if (observation.observedAtMs <= latestAt) return;
            lastRealObservation = structuredClone(observation);
            if (!gameSession.getStatus().recoveryRequired) await gameSession.observe(observation);
        }); },
        observeGame(observation) { return enqueueObservation(async () => {
            if (integration || gameSession.getStatus().recoveryRequired || !themes.enabled || !validGameObservation(observation) ||
                (lastRealObservation && (observation.confirmedAtMs ?? observation.observedAtMs) < lastRealObservation.observedAtMs)) return;
            await gameSession.observeGame(observation, { announce: (reconciledGame || observation.source === 'discord-category') && currentGame() !== null });
            if (observation.source === 'twitch') reconciledGame = true;
        }); },
        async acceptObservation(input) {
            if (!active) return { accepted: false, intent: null, delivered: false, diagnostics: ['unavailable'] };
            const token = generation;
            const result = await progress.acceptObservation(input);
            if (!active || token !== generation || !ready()) { discardVisuals(); return { ...result, delivered: false }; }
            for (const code of result.diagnostics) logger.warn('Donation accounting diagnostic', { code });
            const delivered = result.intent ? publish(composer.accept(result.intent)) : false;
            arm(); return { ...result, delivered };
        },
        async resetIntegration() { if (!integration || !active) throw new Error('Integration reset unavailable'); invalidate(); await progress.reset(); },
        getStatus() {
            const state = progress.getSnapshot(), c = publicCampaign(state);
            return { mode, state, game: currentGame(), gameRecoveryRequired: gameSession?.getStatus().recoveryRequired, crowdCount: crowdIds.length, ...progress.getStatus(), initialized: c.initialized,
                campaignTotalCents: c.totalCents, campaignGoalCents: c.goalCents, nextMilestoneCents: c.nextMilestoneCents,
                themeReady: Boolean(server.getStatus().themeReadyClients), companionReady: ready(), companionConnected: server.getStatus().authenticatedClients > 0, resolution: lastResolution };
        },
        async dispatch(action) {
            if (!active) return { status: 'unavailable', message: 'Stream Avatars stopped.' };
            if (action.name === 'status') return { status: 'ok', message: 'Campaign progress available.' };
            if (['game.reset', 'game.recover'].includes(action.name) && !integration) return enqueueObservation(async () => {
                if (lastRealObservation?.status !== 'offline' || realClock.nowMs() - lastRealObservation.observedAtMs > 2 * cadenceMs) {
                    return { status: 'denied', message: 'Game controls require a fresh confirmed offline Twitch observation.' };
                }
                if (action.name === 'game.reset') await gameSession.reset(); else await gameSession.recover();
                reconciledGame = false;
                return { status: 'ok', message: 'Game state ' + (action.name === 'game.reset' ? 'reset' : 'recovered') + '; campaign progress and donation effects are unchanged.' };
            });
            if (!['campaign.reset','campaign.recover'].includes(action.name) || integration) return { status: 'invalid', message: 'Use npm run sa:integration for development effects.' };
            invalidate();
            if (action.name === 'campaign.reset') await progress.reset(); else await progress.recover();
            return { status: 'ok', message: 'Campaign ' + (action.name === 'campaign.reset' ? 'reset' : 'recovered') + '; current donations and totals will be baselined without replay.' };
        }, stop };
}
module.exports = { startStreamAvatars };
