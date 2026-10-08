const { createInitialState, reduceObservation } = require('./state');

async function createSessionController({ store, clock, mode, channel, graceMs, cadenceMs, newSessionId }) {
    let state = createInitialState({ mode, channel });
    let recoveryRequired = false;
    let active = true;
    let tail = Promise.resolve();
    const listeners = new Set();
    try { state = await store.load() || state; } catch { recoveryRequired = true; }
    const persist = async next => {
        try { await store.save(next); } catch (error) { recoveryRequired = true; throw error; }
    };
    const snapshot = () => structuredClone(state);
    const publish = () => { for (const listener of listeners) { try { listener(snapshot()); } catch { /* A transport subscriber cannot corrupt authoritative progress. */ } } };
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
            state = next; publish();
        }); },
        rebaseRehearsalClock(atMs) { return enqueue(async () => {
            if (recoveryRequired) throw new Error('Session recovery required');
            if (mode !== 'rehearsal' || !Number.isSafeInteger(atMs) || atMs < (state.startedAtMs ?? 0)) throw new Error('Invalid rehearsal clock baseline');
            const next = structuredClone(state); next.revision++; next.recoveryBaselineMs = atMs;
            next.offlineSinceMs = null; next.lastOfflineAtMs = null;
            if (next.latestObservation) {
                next.latestObservation.observedAtMs = atMs;
                if (next.latestObservation.status === 'online') next.latestObservation.startedAtMs = next.startedAtMs;
            }
            await persist(next); state = next; publish();
        }); },
        reset() { return enqueue(async () => { state = await store.archiveAndReset(); recoveryRequired = false; publish(); }); },
        recover() { return enqueue(async () => {
            const recovered = await store.recoverLastBackup();
            recovered.revision++; recovered.recoveryBaselineMs = clock.nowMs();
            await persist(recovered); state = recovered; recoveryRequired = false; publish();
        }); },
        async stop() { active = false; await tail; await store.flush(); await store.close(); listeners.clear(); }
    };
}
module.exports = { createSessionController };
