const { join } = require('node:path');
const { publicSession } = require('./protocol');
const { createCelebrationComposer } = require('./celebrations');
const { createSessionController } = require('../broadcastSession');
const { validObservation } = require('../broadcastSession/state');
const { createSessionStore } = require('../broadcastSession/store');
const { startBridgeServer } = require('./server');
const { createEventDispatcher } = require('./events');
async function startStreamAvatars({ config, logger, signal, webServer, realClock = { nowMs: Date.now }, integration = null }) {
    const settings = config.streamAvatars.config;
    const mode = integration ? 'integration' : 'production';
    const crowdIds = integration ? [...integration.crowdIds] : [];
    const channel = config.twitch.channel;
    const cadenceMs = (config.twitch.viewerSampleIntervalSeconds || 60) * 1000;
    const participantId = config.participantId, intervalCents = settings.donationIntervalCents ?? 50000;
    const session = await createSessionController({ store: createSessionStore({ path: join(settings.stateDir, mode, 'state.json'), mode, channel, participantId, intervalCents }),
        clock: realClock, mode, channel, participantId, intervalCents, graceMs: settings.graceMs, cadenceMs });
    const composer = createCelebrationComposer({ clock: realClock });
    let server, events, stopping, lastResolution = null, active = true, generation = 1, renderedIdentity = '', lastRealObservation = null;
    const snapshot = () => {
        const state = session.getSnapshot();
        return { version: 2, type: 'snapshot', mode, generation, serverNowMs: realClock.nowMs(), session: publicSession(state),
            elapsedMs: state.startedAtMs === null ? 0 : Math.max(0, (state.endedAtMs ?? realClock.nowMs()) - state.startedAtMs),
            integration: { active: Boolean(integration), crowdIds }, features: ['hearts', 'crowd', 'session', 'celebrations'] };
    };
    const notify = invalidate => {
        if (!active) return;
        const identity = session.getSnapshot().sessionId;
        if (invalidate || renderedIdentity !== identity) { composer.clear(); generation++; events?.clear({ mode, generation }); renderedIdentity = identity; }
        server?.send(snapshot());
    };
    const unsubscribe = session.subscribe(() => notify(false));
    const stop = () => {
        if (!stopping) stopping = (async () => {
            active = false; composer.stop(); unsubscribe(); events?.clear({ mode, generation: ++generation });
            await server?.drain(); events?.stop(); await server?.stop(); await session.stop();
        })(); return stopping;
    };
    try {
        events = createEventDispatcher({ realClock, send: message => server?.send(message) || false });
        server = await startBridgeServer({ config: { ...settings, ...config.webServer }, webServer, getSnapshot: snapshot, logger, signal, onClientMessage: async message => {
            if (message.type === 'ready') lastResolution = message.resolution;
            if (message.type === 'diagnostic') logger.warn('Stream Avatars companion diagnostic', { code: message.code });
        } });
        if (signal?.aborted) throw new Error('Stream Avatars startup aborted');
    } catch (error) { await stop(); throw error; }
    return { address: server.address,
        async observeProduction(observation) {
            if (!active || !validObservation(observation)) return;
            const latestAt = Math.max(lastRealObservation?.observedAtMs ?? -1, session.getSnapshot().latestObservation?.observedAtMs ?? -1);
            if (observation.observedAtMs <= latestAt) return;
            lastRealObservation = structuredClone(observation); await session.observe(observation);
        },
        getSessionWindow() {
            const state = session.getSnapshot();
            if (!active || !state.sessionId || session.getStatus().recoveryRequired) return null;
            return { sessionId: state.sessionId, participantId: state.participantId, fromMs: state.startedAtMs, throughMs: realClock.nowMs() };
        },
        async acceptDonations(input) {
            if (!active) return { accepted: false, intent: null, delivered: false, diagnostics: ['unavailable'] };
            const result = await session.acceptDonations(input);
            if (!active || !result) return { accepted: false, intent: null, delivered: false, diagnostics: ['unavailable'] };
            for (const code of result.diagnostics) logger.warn('Donation accounting diagnostic', { code });
            const message = result.intent && composer.accept(result.intent);
            const delivered = Boolean(message && events.publishCelebration({ ...message, mode, generation }));
            return { ...result, delivered };
        },
        async resetIntegration() { if (!integration || !active) throw new Error('Integration reset unavailable'); await session.reset(); },
        getStatus() {
            const state = session.getSnapshot();
            return { mode, state, crowdCount: crowdIds.length, ...session.getStatus(),
                elapsedMs: state.startedAtMs === null ? 0 : Math.max(0, (state.endedAtMs ?? realClock.nowMs()) - state.startedAtMs),
                knownLiveTotalCents: state.liveTotalCents, unknownAmountCount: state.unknownAmountCount,
                companionReady: server.getStatus().readyClients > 0, companionConnected: server.getStatus().authenticatedClients > 0, resolution: lastResolution };
        },
        async dispatch(action) {
            if (!active) return { status: 'unavailable', message: 'Stream Avatars stopped.' };
            if (action.name === 'status') return { status: 'ok', message: 'Production session status available.' };
            if (!['session.reset','session.recover'].includes(action.name) || integration) return { status: 'invalid', message: 'Use npm run sa:integration for development effects.' };
            const observation = lastRealObservation;
            if (observation?.status !== 'offline' || realClock.nowMs() - observation.observedAtMs > 2 * cadenceMs) return { status: 'denied', message: 'Production recovery/reset requires confirmed offline status.' };
            if (action.name === 'session.reset') await session.reset(); else await session.recover();
            notify(true); return { status: 'ok', message: 'Production session ' + (action.name === 'session.reset' ? 'reset and archived.' : 'recovered without replay.') };
        }, stop };
}
module.exports = { startStreamAvatars };
