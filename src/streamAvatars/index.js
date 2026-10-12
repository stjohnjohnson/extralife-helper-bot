const { join } = require('node:path');
const { publicCampaign } = require('./protocol');
const { createCampaignCelebrationComposer } = require('./celebrations');
const { createCampaignProgress } = require('./campaignProgress');
const { createCampaignStore } = require('./campaignStore');
const { startBridgeServer } = require('./server');
const { createEventDispatcher } = require('./events');
async function startStreamAvatars({ config, logger = { warn() {} }, signal, webServer, realClock = { nowMs: Date.now }, timers = { setTimeout, clearTimeout }, integration = null }) {
    const settings = config.streamAvatars.config, mode = integration ? 'integration' : 'production';
    const crowdIds = integration ? [...integration.crowdIds] : [], participantId = String(config.participantId), intervalCents = settings.donationIntervalCents ?? 50000;
    const progress = await createCampaignProgress({ store: createCampaignStore({ path: join(settings.stateDir, mode, 'campaign.json'), mode, participantId, intervalCents }),
        clock: realClock, mode, participantId, intervalCents });
    const composer = createCampaignCelebrationComposer({ clock: realClock, ...(integration?.recognitionAction === 'jump' ? { random: () => 0 } : integration?.recognitionAction === 'hug' ? { random: () => 0.5 } : {}) });
    let server, events, stopping, phaseTimer = null, lastResolution = null, active = true, generation = 1;
    const snapshot = () => ({ version: 3, type: 'snapshot', mode, generation, serverNowMs: realClock.nowMs(), campaign: publicCampaign(progress.getSnapshot()),
        integration: { active: Boolean(integration), crowdIds }, features: ['hearts','crowd','campaign','celebrations','donation-recognition'] });
    const cancelTimer = () => { if (phaseTimer !== null) timers.clearTimeout(phaseTimer); phaseTimer = null; };
    const discardVisuals = () => { cancelTimer(); composer.clear(); progress.clearConfirmations(); };
    const invalidate = () => { discardVisuals(); generation++; events?.clear({ mode, generation }); server?.send(snapshot()); };
    const notify = () => { if (active) server?.send(snapshot()); };
    const unsubscribe = progress.subscribe(notify);
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
            active = false; signal?.removeEventListener('abort', abort); cancelTimer(); composer.stop(); unsubscribe(); events?.clear({ mode, generation: ++generation });
            await server?.drain(); events?.stop(); await server?.stop(); await progress.stop();
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
            return { mode, state, crowdCount: crowdIds.length, ...progress.getStatus(), initialized: c.initialized,
                campaignTotalCents: c.totalCents, campaignGoalCents: c.goalCents, nextMilestoneCents: c.nextMilestoneCents,
                companionReady: ready(), companionConnected: server.getStatus().authenticatedClients > 0, resolution: lastResolution };
        },
        async dispatch(action) {
            if (!active) return { status: 'unavailable', message: 'Stream Avatars stopped.' };
            if (action.name === 'status') return { status: 'ok', message: 'Campaign progress available.' };
            if (!['campaign.reset','campaign.recover'].includes(action.name) || integration) return { status: 'invalid', message: 'Use npm run sa:integration for development effects.' };
            invalidate();
            if (action.name === 'campaign.reset') await progress.reset(); else await progress.recover();
            return { status: 'ok', message: 'Campaign ' + (action.name === 'campaign.reset' ? 'reset' : 'recovered') + '; current donations and totals will be baselined without replay.' };
        }, stop };
}
module.exports = { startStreamAvatars };
