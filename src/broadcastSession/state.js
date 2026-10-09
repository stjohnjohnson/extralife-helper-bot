const { randomUUID } = require('node:crypto');

function createInitialState({ mode, channel }) {
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
function validateSessionState(state, { mode, channel }) {
    const initial = createInitialState({ mode, channel });
    const integers = ['revision', 'liveTotalCents', 'chapter'];
    const times = ['startedAtMs', 'endedAtMs', 'offlineSinceMs', 'lastOfflineAtMs', 'recoveryBaselineMs'];
    if (!state || Object.keys(initial).some(key => !(key in state)) ||
        Object.keys(state).some(key => !(key in initial)) || state.schemaVersion !== 1 ||
        !['production', 'rehearsal'].includes(state.mode) || state.mode !== mode || state.channel !== channel ||
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
            Object.assign(next, createInitialState({ mode: state.mode, channel: state.channel }),
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
module.exports = { createInitialState, reduceObservation, validateSessionState, validObservation };
