const { join } = require('node:path');
const { createSessionController } = require('../broadcastSession');
const { createInitialState, validObservation } = require('../broadcastSession/state');
const { createSessionStore, assertDistinctPaths } = require('../broadcastSession/store');
const { startBridgeServer } = require('./server');
const { createEventDispatcher } = require('./events');
const { createVirtualClock } = require('./clock');
const { createRehearsalController } = require('./rehearsal');
async function startStreamAvatars({ config, logger, signal, standalone = false, realClock = { nowMs: Date.now }, hue = null, onRehearsalStopped = () => {} }) {
    const settings = config.streamAvatars.config;
    const productionPath = join(settings.stateDir, 'production', 'state.json');
    const rehearsalPath = join(settings.stateDir, 'rehearsal', 'state.json');
    await assertDistinctPaths(productionPath, rehearsalPath);
    const channel = config.twitch.channel;
    const cadenceMs = (config.twitch.viewerSampleIntervalSeconds || 60) * 1000;
    const createSession = (mode, path, clock) => createSessionController({ store: createSessionStore({ path, mode, channel }), clock, mode, channel, graceMs: settings.graceMs, cadenceMs });
    const production = standalone ? null : await createSession('production', productionPath, realClock);
    const virtualClock = createVirtualClock({ nowMs: realClock.nowMs() });
    let server; let events; let rehearsal; let active = true; let generation = 1; let stopping; let lastRealObservation = null;
    let renderedIdentity = ''; let lastResolution = null;
    const context = () => {
        const simulated = rehearsal?.getStatus(); const mode = simulated?.active ? 'rehearsal' : 'production';
        const state = mode === 'rehearsal' ? simulated.state : production?.getSnapshot() || createInitialState({ mode: 'production', channel });
        const now = mode === 'rehearsal' ? virtualClock.nowMs() : realClock.nowMs();
        return { mode, state, now, simulated };
    };
    const snapshot = () => {
        const { mode, state, now, simulated } = context();
        return { version: 1, type: 'snapshot', mode, generation, serverNowMs: realClock.nowMs(), session: state,
            elapsedMs: state.startedAtMs === null ? 0 : Math.max(0, (state.endedAtMs ?? now) - state.startedAtMs), strip: settings.strip,
            rehearsal: { active: mode === 'rehearsal', crowdIds: mode === 'rehearsal' ? simulated.crowdIds : [] }, features: ['hearts', 'crowd', 'session', 'clock'],
            render: { maxHearts: settings.maxHearts, heartOffset: settings.heartOffset } };
    };
    const notify = invalidate => {
        if (!active) return;
        const { mode, state } = context(); const identity = mode + ':' + state.sessionId;
        if (invalidate || renderedIdentity !== identity) { generation++; events?.clear({ mode, generation }); renderedIdentity = identity; }
        server?.send(snapshot());
    };
    const unsubscribe = production?.subscribe(() => notify(false));
    const stop = () => {
        if (!stopping) stopping = (async () => {
            active = false; unsubscribe?.(); events?.clear({ mode: 'production', generation: ++generation });
            await rehearsal?.stop(); events?.stop(); await server?.stop(); await production?.stop();
        })(); return stopping;
    };
    try {
        events = createEventDispatcher({ realClock, send: message => server?.send(message) || false });
        rehearsal = await createRehearsalController({ createSession: () => createSession('rehearsal', rehearsalPath, virtualClock),
            productionStatus: () => lastRealObservation, clock: virtualClock, realClock, graceMs: settings.graceMs, cadenceMs, standalone, notify,
            bridge: { disconnectClients: () => server?.disconnectClients() }, hue: typeof hue === 'function' ? hue : () => hue,
            eventDispatcher: { publishHearts: ({ sessionId }) => events.publishHearts({ mode: 'rehearsal', generation, sessionId }) } });
        server = await startBridgeServer({ config: settings, getSnapshot: snapshot, logger, signal, onClientMessage: async message => {
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
        getStatus() {
            const current = context(); const state = current.state;
            return { mode: current.mode, state, crowdCount: current.simulated?.active ? current.simulated.crowdIds.length : 0, hueEnabled: current.simulated?.hueEnabled || false,
                elapsedMs: state.startedAtMs === null ? 0 : Math.max(0, current.now - state.startedAtMs), recoveryRequired: production?.getStatus().recoveryRequired || current.simulated?.recoveryRequired,
                companionConnected: server.getStatus().authenticatedClients > 0, resolution: lastResolution };
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
        registerScenario: rehearsal.registerScenario, stop };
}
module.exports = { startStreamAvatars };
