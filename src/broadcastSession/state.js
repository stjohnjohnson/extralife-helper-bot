const { randomUUID } = require('node:crypto');
const { donationFields, validCampaign } = require('./donations');

function createLegacyState({ mode, channel }) {
    return { schemaVersion: 1, mode, channel, revision: 0, sessionId: null, startedAtMs: null,
        endedAtMs: null, latestObservation: null, offlineSinceMs: null, lastOfflineAtMs: null,
        processedDonationIds: [], liveTotalCents: 0, reachedDonationCheckpoints: [],
        reachedTimeCheckpoints: [], chapter: 0, campaignGoalReached: false, recoveryBaselineMs: null };
}
function validObservation(value) {
    return value && ['online', 'offline', 'unknown'].includes(value.status) &&
        Number.isFinite(value.observedAtMs) && value.observedAtMs >= 0 &&
        (value.status !== 'online' || (typeof value.streamId === 'string' && value.streamId.length > 0 &&
            Number.isFinite(value.startedAtMs) && value.startedAtMs >= 0 && value.startedAtMs <= value.observedAtMs));
}
function validateLegacyState(state, { mode, channel }) {
    const initial = createLegacyState({ mode, channel });
    const integers = ['revision', 'liveTotalCents', 'chapter'];
    const times = ['startedAtMs', 'endedAtMs', 'offlineSinceMs', 'lastOfflineAtMs', 'recoveryBaselineMs'];
    if (!state || Object.keys(initial).some(key => !(key in state)) ||
        Object.keys(state).some(key => !(key in initial)) || state.schemaVersion !== 1 ||
        !['production', 'rehearsal', 'integration'].includes(state.mode) || state.mode !== mode || state.channel !== channel ||
        integers.some(key => !Number.isSafeInteger(state[key]) || state[key] < 0) ||
        times.some(key => state[key] !== null && (!Number.isFinite(state[key]) || state[key] < 0)) ||
        !Array.isArray(state.processedDonationIds) || state.processedDonationIds.some(id => typeof id !== 'string') ||
        ['reachedDonationCheckpoints', 'reachedTimeCheckpoints'].some(key => !Array.isArray(state[key]) ||
            state[key].some(value => !Number.isSafeInteger(value) || value < 0)) ||
        typeof state.campaignGoalReached !== 'boolean' ||
        (state.sessionId !== null && (typeof state.sessionId !== 'string' || !state.sessionId || state.startedAtMs === null)) ||
        (state.latestObservation !== null && !validObservation(state.latestObservation))) {
        throw new Error('Invalid broadcast session state');
    }
    return structuredClone(state);
}
function reduceObservation(state, observation, { graceMs, cadenceMs, newSessionId = randomUUID }) {
    if (!validObservation(observation)) throw new Error('Invalid broadcast observation');
    if (state.latestObservation && observation.observedAtMs <= state.latestObservation.observedAtMs) return state;
    const next = structuredClone(state);
    const time = observation.observedAtMs;
    const continuous = next.lastOfflineAtMs !== null && time - next.lastOfflineAtMs <= 2 * cadenceMs;
    const graceReached = continuous && next.offlineSinceMs !== null && time - next.offlineSinceMs >= graceMs;
    if (observation.status === 'online') {
        if (!next.sessionId || next.endedAtMs !== null || graceReached) {
            Object.assign(next, createInitialState({ mode: state.mode, channel: state.channel, participantId: state.participantId, intervalCents: state.donationIntervalCents }),
                { sessionId: newSessionId(), startedAtMs: observation.startedAtMs, recoveryBaselineMs: time });
        }
        next.offlineSinceMs = null;
        next.lastOfflineAtMs = null;
    } else if (observation.status === 'offline' && next.sessionId && next.endedAtMs === null) {
        if (!continuous) next.offlineSinceMs = time;
        next.lastOfflineAtMs = time;
        if (graceReached) next.endedAtMs = time;
    } else {
        next.offlineSinceMs = null;
        next.lastOfflineAtMs = null;
    }
    next.latestObservation = structuredClone(observation);
    next.revision = state.revision + 1;
    return next;
}
function createInitialState(options) {
    return { ...createLegacyState(options), ...donationFields(options.intervalCents), schemaVersion: 2,
        participantId: options.participantId == null ? null : String(options.participantId), currency: 'USD', donationsReconciled: false };
}
function validateSessionState(state, options) {
    const initial = createInitialState(options);
    if (!state || state.schemaVersion !== 2 || Object.keys(initial).some(key => !(key in state)) || Object.keys(state).some(key => !(key in initial))) throw new Error('Invalid broadcast session state');
    const legacy = Object.fromEntries(Object.keys(createLegacyState(options)).map(key => [key, state[key]]));
    legacy.schemaVersion = 1; validateLegacyState(legacy, options);
    const safe = value => Number.isSafeInteger(value) && value >= 0;
    const participantMatches = options.participantId === undefined || state.participantId === String(options.participantId);
    if (!participantMatches || (state.participantId !== null && (typeof state.participantId !== 'string' || !state.participantId)) || state.currency !== 'USD' ||
        ![state.unknownAmountCount, state.donationCheckpointCount, state.donationIntervalCents].every(safe) || state.donationIntervalCents === 0 ||
        typeof state.donationsReconciled !== 'boolean' || (state.pendingGoalDonationUntilMs !== null && !safe(state.pendingGoalDonationUntilMs)) ||
        (state.campaignObservation !== null && !validCampaign(state.campaignObservation)) ||
        !state.donationLedger || Array.isArray(state.donationLedger) || typeof state.donationLedger !== 'object' ||
        new Set(state.processedDonationIds).size !== state.processedDonationIds.length ||
        Object.entries(state.donationLedger).some(([id, item]) => !state.processedDonationIds.includes(id) || !item || Object.keys(item).length !== 2 || !safe(item.createdAtMs) || (item.amountCents !== null && !safe(item.amountCents)))) throw new Error('Invalid broadcast session state');
    return structuredClone(state);
}
function migrateSessionState(state, options) {
    if (state?.schemaVersion !== 1) return validateSessionState(state, options);
    validateLegacyState(state, options);
    const migrated = { ...createInitialState(options), ...structuredClone(state), schemaVersion: 2 };
    migrated.donationCheckpointCount = Math.floor(Math.max(0, ...state.reachedDonationCheckpoints) / migrated.donationIntervalCents);
    return validateSessionState(migrated, options);
}

module.exports = { createInitialState, reduceObservation, validateSessionState, migrateSessionState, validObservation };
