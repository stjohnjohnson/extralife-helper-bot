const features = ['hearts', 'crowd', 'session', 'celebrations'];
const finite = value => Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
const exact = (value, keys) => value && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const common = value => value?.version === 2 && ['production', 'integration'].includes(value.mode) && Number.isSafeInteger(value.generation) && value.generation >= 0;
function crowdIds(value) { return Array.isArray(value) && value.length <= 100 && new Set(value).size === value.length && value.every(entry => /^sa_rehearsal_(?:[1-9]|[1-9]\d|100)$/.test(entry)); }
function invalid() { throw new Error('Invalid Stream Avatars message'); }
function decodeClientMessage(raw) {
    let value;
    try { if (Buffer.byteLength(raw) > 65536) invalid(); value = JSON.parse(raw); } catch { invalid(); }
    if (value?.version !== 2) invalid();
    if (value.type === 'auth' && exact(value, ['version', 'type', 'token']) && typeof value.token === 'string' && value.token.length <= 256) return value;
    if (value.type === 'heartbeat' && exact(value, ['version', 'type'])) return value;
    if (value.type === 'diagnostic' && exact(value, ['version', 'type', 'code']) && ['missing-heart-image', 'missing-celebration-image', 'unsupported-message', 'render-error', 'custom-service-required', 'action-error', 'density-limit'].includes(value.code)) return value;
    if (value.type === 'ready' && exact(value, ['version', 'type', 'capabilities', 'resolution']) &&
        Array.isArray(value.capabilities) && value.capabilities.length <= 4 && value.capabilities.every(item => features.includes(item)) &&
        exact(value.resolution, ['width', 'height']) && positive(value.resolution.width) && positive(value.resolution.height)) return value;
    invalid();
}
function validateServerMessage(value) {
    if (value?.type === 'heartbeat' && exact(value, ['version', 'type', 'serverNowMs']) && value.version === 2 && finite(value.serverNowMs)) return value;
    if (!common(value)) invalid();
    if (value.type === 'clear' && exact(value, ['version', 'type', 'mode', 'generation'])) return value;
    if (value.type === 'crowd' && exact(value, ['version', 'type', 'mode', 'generation', 'crowdIds']) && value.mode === 'integration' && crowdIds(value.crowdIds)) return value;
    if (value.type === 'hearts' && exact(value, ['version', 'type', 'mode', 'generation', 'sessionId', 'id', 'issuedAtMs', 'expiresAtMs', 'durationMs']) &&
        id(value.sessionId) && id(value.id) && finite(value.issuedAtMs) && finite(value.expiresAtMs) && value.expiresAtMs > value.issuedAtMs && value.expiresAtMs - value.issuedAtMs <= 10000 && value.durationMs === 5000) return value;
    if (value.type === 'celebration' && exact(value, ['version', 'type', 'mode', 'generation', 'sessionId', 'id', 'issuedAtMs', 'expiresAtMs', 'heartsUntilMs', 'partyUntilMs', 'kind', 'liveTotalCents', 'milestoneCents']) &&
        id(value.sessionId) && id(value.id) && ['donation', 'milestone', 'goal'].includes(value.kind) &&
        finite(value.issuedAtMs) && finite(value.expiresAtMs) && value.expiresAtMs > value.issuedAtMs && value.expiresAtMs <= value.issuedAtMs + 10000 &&
        [value.heartsUntilMs, value.partyUntilMs].every(time => Number.isSafeInteger(time) && time >= 0) && value.heartsUntilMs <= value.issuedAtMs + 10000 && value.partyUntilMs <= value.issuedAtMs + 38000 &&
        Number.isSafeInteger(value.liveTotalCents) && value.liveTotalCents >= 0 && (value.milestoneCents === null || (Number.isSafeInteger(value.milestoneCents) && value.milestoneCents > 0 && value.milestoneCents <= value.liveTotalCents))) return value;
    if (value.type === 'snapshot' && exact(value, ['version', 'type', 'mode', 'generation', 'serverNowMs', 'session', 'elapsedMs', 'integration', 'features']) &&
        finite(value.serverNowMs) && finite(value.elapsedMs) && value.elapsedMs >= 0 &&
        exact(value.integration, ['active', 'crowdIds']) && typeof value.integration.active === 'boolean' && crowdIds(value.integration.crowdIds) &&
        Array.isArray(value.features) && value.features.length <= 4 && value.features.every(item => features.includes(item))) {
        if (!validPublicSession(value.session)) invalid();
        return value;
    }
    invalid();
}
function publicSession(state) {
    return Object.fromEntries(['sessionId', 'startedAtMs', 'endedAtMs', 'liveTotalCents', 'chapter', 'campaignGoalReached'].map(key => [key, state[key]]));
}
function validPublicSession(state) {
    return exact(state, ['sessionId', 'startedAtMs', 'endedAtMs', 'liveTotalCents', 'chapter', 'campaignGoalReached']) &&
        (state.sessionId === null || id(state.sessionId)) && ['startedAtMs', 'endedAtMs'].every(key => state[key] === null || (Number.isSafeInteger(state[key]) && state[key] >= 0)) &&
        ['liveTotalCents', 'chapter'].every(key => Number.isSafeInteger(state[key]) && state[key] >= 0) && typeof state.campaignGoalReached === 'boolean';
}
module.exports = { decodeClientMessage, validateServerMessage, crowdIds, publicSession };
