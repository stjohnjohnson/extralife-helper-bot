const { randomUUID } = require('node:crypto');
const { createCampaignState, validateCampaignState, reduceCampaignProgress, validCampaign } = require('./campaignState');
async function createCampaignProgress({ store, clock, mode, participantId, intervalCents = 50000, newEpochId = randomUUID }) {
    let state = createCampaignState({ mode, participantId, intervalCents }), epochId = newEpochId();
    let recoveryRequired = false, donationBaseline = true, campaignBaseline = true, pendingConfirmations = [], active = true, tail = Promise.resolve();
    const listeners = new Set();
    try { const loaded = await store.load(); if (loaded) state = validateCampaignState(loaded, { mode, participantId }); } catch { recoveryRequired = true; }
    const enqueue = fn => { const result = tail.then(() => active ? fn() : { accepted: false, intent: null, diagnostics: ['unavailable'] }); tail = result.catch(() => {}); return result; };
    const rebase = next => { state = next; donationBaseline = true; campaignBaseline = true; pendingConfirmations = []; epochId = newEpochId(); recoveryRequired = false; };
    const publish = intent => { if (active) for (const listener of listeners) { try { listener(structuredClone(state), intent); } catch { /* Transport cannot corrupt progress. */ } } };
    return {
        getSnapshot: () => structuredClone(state),
        getStatus: () => ({ recoveryRequired, reconciliationRequired: donationBaseline || campaignBaseline }),
        getPollCheckpoint: () => ({ epochId, participantId: state.participantId, baselineAtMs: state.baselineAtMs, baselineNeeded: donationBaseline,
            rawSeenDonationIds: [...state.rawSeenDonationIds], recordCount: state.recordCount }),
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        acceptObservation(input) { return enqueue(async () => {
            if (recoveryRequired) throw new Error('Campaign recovery required');
            if (input.expectedEpochId !== epochId) return { accepted: false, intent: null, diagnostics: ['stale-epoch'] };
            const result = reduceCampaignProgress(state, { ...input, observedAtMs: input.observedAtMs ?? clock.nowMs(), intervalCents,
                baseline: input.baseline || (donationBaseline && input.donations !== undefined), campaignBaseline }, { pendingConfirmations });
            if (JSON.stringify(state) !== JSON.stringify(result.state)) {
                result.state.revision = state.revision + 1;
                try { await store.save(result.state); } catch (error) { recoveryRequired = true; throw error; }
            }
            state = result.state; pendingConfirmations = result.pendingConfirmations;
            if (input.complete) donationBaseline = false;
            if (validCampaign(input.campaign)) campaignBaseline = false;
            publish(result.intent);
            return { accepted: true, intent: result.intent, diagnostics: result.diagnostics };
        }); },
        reset() { return enqueue(async () => { rebase(await store.archiveAndReset()); publish(null); }); },
        recover() { return enqueue(async () => { rebase(await store.recoverLastBackup()); publish(null); }); },
        clearConfirmations() { pendingConfirmations = []; },
        async stop() { active = false; await tail; await store.flush(); await store.close(); listeners.clear(); }
    };
}
module.exports = { createCampaignProgress };
