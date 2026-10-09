const { createInitialState, reduceObservation, migrateSessionState } = require('./state');
const { reduceDonations, validCampaign } = require('./donations');

async function createSessionController({ store, clock, mode, channel, graceMs, cadenceMs, newSessionId, participantId, intervalCents = 50000 }) {
    let state = createInitialState({ mode, channel, participantId, intervalCents });
    let recoveryRequired = false;
    let reconciliationRequired = true;
    let campaignReconciliationRequired = true;
    let active = true;
    let tail = Promise.resolve();
    const listeners = new Set();
    try { const loaded = await store.load(); if (loaded) state = migrateSessionState(loaded, { mode, channel, participantId, intervalCents }); } catch { recoveryRequired = true; }
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
        getStatus: () => ({ recoveryRequired, reconciliationRequired }),
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        observe(observation) { return enqueue(async () => {
            if (recoveryRequired) throw new Error('Session recovery required');
            const next = reduceObservation(state, observation, { graceMs, cadenceMs, newSessionId });
            if (next === state) return;
            await persist(next);
            if (state.sessionId !== next.sessionId) { reconciliationRequired = true; campaignReconciliationRequired = true; }
            state = next; publish();
        }); },
        acceptDonations({ expectedSessionId, scan, campaign, observedAtMs = clock.nowMs() }) { return enqueue(async () => {
            if (recoveryRequired) throw new Error('Session recovery required');
            if (!state.sessionId || expectedSessionId !== state.sessionId) return { accepted: false, intent: null, diagnostics: ['stale-session'] };
            const freshCampaign = validCampaign(campaign) && (!state.campaignObservation || campaign.observedAtMs > state.campaignObservation.observedAtMs);
            const result = reduceDonations(state, { scan, campaign, observedAtMs, intervalCents, reconcile: reconciliationRequired, reconcileCampaign: campaignReconciliationRequired });
            result.state.donationsReconciled = true;
            if (JSON.stringify(state) !== JSON.stringify(result.state)) {
                result.state.revision = state.revision + 1;
                await persist(result.state); state = result.state; publish();
            }
            reconciliationRequired = false;
            if (freshCampaign) campaignReconciliationRequired = false;
            return { accepted: true, intent: result.intent, diagnostics: result.diagnostics };
        }); },
        reset() { return enqueue(async () => { state = await store.archiveAndReset(); state.participantId = participantId == null ? null : String(participantId); recoveryRequired = false; reconciliationRequired = true; campaignReconciliationRequired = true; publish(); }); },
        recover() { return enqueue(async () => {
            const recovered = await store.recoverLastBackup();
            recovered.revision++; recovered.recoveryBaselineMs = clock.nowMs();
            await persist(recovered); state = recovered; recoveryRequired = false; reconciliationRequired = true; campaignReconciliationRequired = true; publish();
        }); },
        async stop() { active = false; await tail; await store.flush(); await store.close(); listeners.clear(); }
    };
}
module.exports = { createSessionController };
