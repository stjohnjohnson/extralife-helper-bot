const { randomUUID } = require('node:crypto');
const { cleanGameName, THEME_IDS } = require('../streamAvatars/themes');
const validGameIdentity = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validThemeId = value => value === null || THEME_IDS.includes(value);
function validGameObservation(value) {
    return value && cleanGameName(value.gameName) !== null && Number.isFinite(value.observedAtMs) && value.observedAtMs >= 0 && ['twitch', 'discord-category'].includes(value.source) &&
        (!Object.hasOwn(value, 'confirmedAtMs') || (value.source === 'discord-category' && Number.isFinite(value.confirmedAtMs) && value.confirmedAtMs >= value.observedAtMs));
}
function validGame(value) {
    return value && Object.keys(value).length === 5 && ['identity', 'displayName', 'themeId', 'observedAtMs', 'source'].every(key => Object.hasOwn(value, key)) &&
        validGameIdentity(value.identity) && validThemeId(value.themeId) && cleanGameName(value.displayName) === value.displayName &&
        validGameObservation({ gameName: value.displayName, observedAtMs: value.observedAtMs, source: value.source });
}

function createInitialState({ mode, channel }) {
    return { schemaVersion: 2, game: null, mode, channel, revision: 0, sessionId: null, startedAtMs: null,
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
    if (state?.schemaVersion === 1) {
        const legacyKeys = Object.keys(initial).filter(key => key !== 'game');
        if (Object.keys(state).length !== legacyKeys.length || legacyKeys.some(key => !Object.hasOwn(state, key))) throw new Error('Invalid broadcast session state');
        return validateSessionState({ ...state, schemaVersion: 2, game: null }, { mode, channel });
    }
    const integers = ['revision', 'liveTotalCents', 'chapter'];
    const times = ['startedAtMs', 'endedAtMs', 'offlineSinceMs', 'lastOfflineAtMs', 'recoveryBaselineMs'];
    if (!state || Object.keys(initial).some(key => !(key in state)) ||
        Object.keys(state).some(key => !(key in initial)) || state.schemaVersion !== 2 ||
        !['production', 'rehearsal'].includes(state.mode) || state.mode !== mode || state.channel !== channel ||
        integers.some(key => !Number.isSafeInteger(state[key]) || state[key] < 0) ||
        times.some(key => state[key] !== null && (!Number.isFinite(state[key]) || state[key] < 0)) ||
        !Array.isArray(state.processedDonationIds) || state.processedDonationIds.some(id => typeof id !== 'string') ||
        ['reachedDonationCheckpoints', 'reachedTimeCheckpoints'].some(key => !Array.isArray(state[key]) ||
            state[key].some(value => !Number.isSafeInteger(value) || value < 0)) ||
        typeof state.campaignGoalReached !== 'boolean' ||
        (state.sessionId !== null && (typeof state.sessionId !== 'string' || !state.sessionId || state.startedAtMs === null)) ||
        (state.latestObservation !== null && !validObservation(state.latestObservation)) ||
        (state.game !== null && !validGame(state.game))) {
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
        if (graceReached) { next.endedAtMs = time; next.game = null; }
    } else {
        next.offlineSinceMs = null;
        next.lastOfflineAtMs = null;
    }
    next.latestObservation = structuredClone(observation);
    next.revision = state.revision + 1;
    return next;
}
module.exports = { createInitialState, reduceObservation, validateSessionState, validObservation, validGameObservation, validGame, validGameIdentity, validThemeId };
