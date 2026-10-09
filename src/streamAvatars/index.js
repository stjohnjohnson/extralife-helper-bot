const { join } = require('node:path');
const { createCelebrationComposer } = require('./celebrations');
const { publicSession } = require('./protocol');
const { createSessionController } = require('../broadcastSession');
const { createInitialState, validObservation } = require('../broadcastSession/state');
const { createSessionStore } = require('../broadcastSession/store');
const { startBridgeServer } = require('./server');
const { createEventDispatcher } = require('./events');
const { createRehearsalController } = require('./rehearsal');
async function startStreamAvatars({ config, logger, signal, webServer, standalone = false, realClock = { nowMs: Date.now }, onRehearsalStopped = () => {} }) {
    const settings = config.streamAvatars.config;
    const productionPath = join(settings.stateDir, 'production', 'state.json');
    const channel = config.twitch.channel;
    const cadenceMs = (config.twitch.viewerSampleIntervalSeconds || 60) * 1000;
    const participantId = config.participantId; const intervalCents = settings.donationIntervalCents ?? 50000;
    const composer = createCelebrationComposer({ clock: realClock });
    const createSession = (mode, path, clock) => createSessionController({ store: createSessionStore({ path, mode, channel, participantId, intervalCents }), clock, mode, channel, participantId, intervalCents, graceMs: settings.graceMs, cadenceMs });
    const production = standalone ? null : await createSession('production', productionPath, realClock);
    let server; let events; let rehearsal; let active = true; let generation = 1; let stopping; let lastRealObservation = null;
    let renderedIdentity = ''; let lastResolution = null;
    const context = () => {
        const simulated = rehearsal?.getStatus(); const mode = simulated?.active ? 'rehearsal' : 'production';
        const state = mode === 'rehearsal' ? simulated.state : production?.getSnapshot() || createInitialState({ mode: 'production', channel });
        const now = realClock.nowMs();
        return { mode, state, now, simulated };
    };
    const snapshot = () => {
        const { mode, state, now, simulated } = context();
        return { version: 2, type: 'snapshot', mode: mode === 'rehearsal' ? 'integration' : mode, generation, serverNowMs: realClock.nowMs(), session: publicSession(state),
            elapsedMs: state.startedAtMs === null ? 0 : Math.max(0, (state.endedAtMs ?? now) - state.startedAtMs),
            integration: { active: mode === 'rehearsal', crowdIds: mode === 'rehearsal' ? simulated.crowdIds : [] }, features: ['hearts', 'crowd', 'session', 'celebrations'] };
    };
    const notify = invalidate => {
        if (!active) return;
        const { mode, state } = context(); const identity = mode + ':' + state.sessionId;
        if (invalidate || renderedIdentity !== identity) { composer.clear(); generation++; events?.clear({ mode, generation }); renderedIdentity = identity; }
        server?.send(snapshot());
    };
    const unsubscribe = production?.subscribe(() => notify(false));
    const stop = () => {
        if (!stopping) stopping = (async () => {
            active = false; composer.stop(); unsubscribe?.(); events?.clear({ mode: 'production', generation: ++generation });
            await rehearsal?.stop(); events?.stop(); await server?.stop(); await production?.stop();
        })(); return stopping;
    };
    try {
        events = createEventDispatcher({ realClock, send: message => server?.send(message) || false });
        rehearsal = createRehearsalController({ channel, productionStatus: () => lastRealObservation, realClock, cadenceMs, standalone, notify,
            eventDispatcher: { publishHearts: ({ sessionId }) => events.publishHearts({ mode: 'rehearsal', generation, sessionId }) } });
        server = await startBridgeServer({ config: { ...settings, ...config.webServer }, webServer, getSnapshot: snapshot, logger, signal, onClientMessage: async message => {
            if (message.type === 'ready') lastResolution = message.resolution;
            if (message.type === 'diagnostic') logger.warn('Stream Avatars companion diagnostic', { code: message.code });
        } });
        if (signal?.aborted) throw new Error('Stream Avatars startup aborted');
    } catch (error) { await stop(); throw error; }
    return { address: server.address,
        async observeProduction(observation) {
            if (!active || standalone) return;
            const latestAt = Math.max(lastRealObservation?.observedAtMs ?? -1, production.getSnapshot().latestObservation?.observedAtMs ?? -1);
            if (!validObservation(observation) || observation.observedAtMs <= latestAt) return;
            lastRealObservation = structuredClone(observation);
            const stoppedRehearsal = rehearsal.observeProduction(observation);
            await production.observe(observation);
            if (stoppedRehearsal && active) onRehearsalStopped();
        },
        getSessionWindow() {
            const state = production?.getSnapshot();
            if (!active || !state?.sessionId || production.getStatus().recoveryRequired) return null;
            return { sessionId: state.sessionId, participantId: state.participantId, fromMs: state.startedAtMs, throughMs: realClock.nowMs() };
        },
        async acceptDonations(input) {
            if (!active || !production) return { accepted: false, intent: null, delivered: false, diagnostics: ['unavailable'] };
            const result = await production.acceptDonations(input);
            if (!active || !result) return { accepted: false, intent: null, delivered: false, diagnostics: ['unavailable'] };
            for (const code of result.diagnostics) logger.warn('Donation accounting diagnostic', { code });
            const message = result.intent && composer.accept(result.intent);
            const delivered = Boolean(message && context().mode === 'production' && events.publishCelebration({ ...message, mode: 'production', generation }));
            return { ...result, delivered };
        },
        getStatus() {
            const current = context(); const state = current.state;
            return { mode: current.mode, state, crowdCount: current.simulated?.active ? current.simulated.crowdIds.length : 0,
                elapsedMs: state.startedAtMs === null ? 0 : Math.max(0, current.now - state.startedAtMs), recoveryRequired: production?.getStatus().recoveryRequired,
                knownLiveTotalCents: state.liveTotalCents, unknownAmountCount: state.unknownAmountCount, reconciliationRequired: production?.getStatus().reconciliationRequired,
                companionReady: server.getStatus().readyClients > 0, companionConnected: server.getStatus().authenticatedClients > 0, resolution: lastResolution };
        },
        async dispatch(action, commandContext) {
            if (!active) return { status: 'unavailable', message: 'Stream Avatars stopped.' };
            if (['session.reset', 'session.recover'].includes(action.name)) {
                if (!production) return { status: 'denied', message: 'Production recovery is unavailable in standalone rehearsal.' };
                if (lastRealObservation?.status !== 'offline' || realClock.nowMs() - lastRealObservation.observedAtMs > 2 * cadenceMs) return { status: 'denied', message: 'Production recovery/reset requires confirmed offline status.' };
                if (action.name === 'session.reset') await production.reset(); else await production.recover();
                notify(true); return { status: 'ok', message: 'Production session ' + (action.name === 'session.reset' ? 'reset and archived.' : 'recovered without replay.') };
            }
            if (action.name === 'hearts' && !rehearsal.getStatus().active) {
                const state = production?.getSnapshot();
                if (!state?.sessionId || state.endedAtMs !== null || production.getStatus().recoveryRequired || lastRealObservation?.status !== 'online' || realClock.nowMs() - lastRealObservation.observedAtMs > 2 * cadenceMs) return { status: 'denied', message: 'Heart preview requires active rehearsal or confirmed live production.' };
                const delivered = events.publishHearts({ mode: 'production', generation, sessionId: state.sessionId });
                return { status: delivered ? 'ok' : 'unavailable', message: delivered ? 'Heart preview sent.' : 'Stream Avatars companion unavailable; preview was not queued.' };
            }
            return rehearsal.dispatch(action, commandContext);
        },
        stop };
}
module.exports = { startStreamAvatars };
