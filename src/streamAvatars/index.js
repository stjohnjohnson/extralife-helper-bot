const { join } = require('node:path');
const { createSessionController } = require('../broadcastSession');
const { createSessionStore, assertDistinctPaths } = require('../broadcastSession/store');
const { startBridgeServer } = require('./server');
const { createEventDispatcher } = require('./events');
async function startStreamAvatars({ config, logger, signal }) {
    const settings = config.streamAvatars.config;
    const productionPath = join(settings.stateDir, 'production', 'state.json');
    const rehearsalPath = join(settings.stateDir, 'rehearsal', 'state.json');
    await assertDistinctPaths(productionPath, rehearsalPath);
    const clock = { nowMs: Date.now };
    const session = await createSessionController({ store: createSessionStore({ path: productionPath, mode: 'production', channel: config.twitch.channel }), clock,
        mode: 'production', channel: config.twitch.channel, graceMs: settings.graceMs, cadenceMs: (config.twitch.viewerSampleIntervalSeconds || 60) * 1000 });
    let server; let events; let active = true; let generation = 1; let stopping;
    const snapshot = () => {
        const state = session.getSnapshot();
        return { version: 1, type: 'snapshot', mode: 'production', generation, serverNowMs: Date.now(), session: state,
            elapsedMs: state.startedAtMs === null ? 0 : Math.max(0, (state.endedAtMs ?? Date.now()) - state.startedAtMs), strip: settings.strip,
            rehearsal: { active: false, crowdIds: [] }, features: ['hearts', 'crowd', 'session', 'clock'], render: { maxHearts: settings.maxHearts, heartOffset: settings.heartOffset } };
    };
    const unsubscribe = session.subscribe(() => { if (active) server?.send(snapshot()); });
    const stop = () => {
        if (!stopping) stopping = (async () => { active = false; unsubscribe(); events?.clear({ mode: 'production', generation: ++generation }); events?.stop(); await server?.stop(); await session.stop(); })();
        return stopping;
    };
    try {
        server = await startBridgeServer({ config: settings, getSnapshot: snapshot, logger, signal });
        if (signal?.aborted) throw new Error('Stream Avatars startup aborted');
        events = createEventDispatcher({ realClock: clock, send: message => server.send(message) });
    } catch (error) { await stop(); throw error; }
    return { observeProduction: observation => active ? session.observe(observation) : Promise.resolve(),
        getStatus: () => ({ ...session.getStatus(), mode: 'production', state: session.getSnapshot() }),
        async dispatch() { return { status: 'unavailable', message: 'Stream Avatars rehearsal controls are unavailable.' }; }, stop };
}
module.exports = { startStreamAvatars };
