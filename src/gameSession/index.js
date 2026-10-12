// Persistent game lifecycle is independent of campaign donation progress.
const { createInitialState, reduceObservation, validGameObservation } = require('./state');
const { resolveGame } = require('../streamAvatars/themes');

async function createSessionController({ store, clock, mode, channel, graceMs, cadenceMs, newSessionId, gameConfig }) {
    let state = createInitialState({ mode, channel });
    let recoveryRequired = false;
    let active = true;
    let tail = Promise.resolve();
    const listeners = new Set();
    try { state = await store.load() || state; } catch { recoveryRequired = true; }
    // Advance duplicate ordering in memory without rewriting unchanged game state on every poll.
    let gameWatermark = state.game;
    const persist = async next => {
        try { await store.save(next); } catch (error) { recoveryRequired = true; throw error; }
    };
    const snapshot = () => structuredClone(state);
    const publish = change => { for (const listener of listeners) { try { listener(snapshot(), change); } catch { /* A transport subscriber cannot corrupt authoritative progress. */ } } };
    const enqueue = operation => {
        const result = tail.then(async () => { if (!active) return; return operation(); });
        tail = result.catch(() => {}); return result;
    };
    return {
        getSnapshot: snapshot,
        getStatus: () => ({ recoveryRequired }),
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        observe(observation) { return enqueue(async () => {
            if (recoveryRequired) throw new Error('Session recovery required');
            const next = reduceObservation(state, observation, { graceMs, cadenceMs, newSessionId });
            if (next === state) return;
            await persist(next);
            if (state.sessionId !== next.sessionId || next.endedAtMs !== null) gameWatermark = null;
            state = next; publish();
        }); },
        observeGame(observation, { announce = false } = {}) { return enqueue(async () => {
            if (recoveryRequired) throw new Error('Session recovery required');
            if (!validGameObservation(observation) || !gameConfig || !state.sessionId || state.endedAtMs !== null ||
                state.latestObservation?.status !== 'online' || clock.nowMs() - state.latestObservation.observedAtMs > 2 * cadenceMs) return;
            // Successful writes order at confirmation; reads retain their request-start time.
            const orderedAtMs = observation.confirmedAtMs ?? observation.observedAtMs;
            if (gameWatermark && (orderedAtMs < gameWatermark.observedAtMs ||
                (orderedAtMs === gameWatermark.observedAtMs && (observation.source !== 'twitch' || gameWatermark.source === 'twitch')))) return;
            const resolved = resolveGame(observation.gameName, gameConfig);
            const game = { ...resolved, observedAtMs: orderedAtMs, source: observation.source };
            if (state.game?.identity === game.identity) { gameWatermark = game; return; }
            const next = { ...structuredClone(state), game, revision: state.revision + 1 };
            await persist(next);
            state = next; gameWatermark = game; publish({ announce });
            return { changed: true, game: structuredClone(game) };
        }); },
        reset() { return enqueue(async () => { state = await store.archiveAndReset(); recoveryRequired = false; gameWatermark = state.game; publish(); }); },
        recover() { return enqueue(async () => {
            const recovered = await store.recoverLastBackup();
            recovered.revision++; recovered.recoveryBaselineMs = clock.nowMs();
            await persist(recovered); state = recovered; recoveryRequired = false; gameWatermark = state.game; publish();
        }); },
        async stop() { active = false; await tail; await store.flush(); await store.close(); listeners.clear(); }
    };
}
module.exports = { createSessionController };
