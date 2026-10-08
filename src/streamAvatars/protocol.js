const { validateSessionState } = require('../broadcastSession/state');
const features = ['hearts', 'crowd', 'session', 'clock'];
const finite = value => Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
const exact = (value, keys) => value && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const common = value => value?.version === 1 && ['production', 'rehearsal'].includes(value.mode) && Number.isSafeInteger(value.generation) && value.generation >= 0;
function crowdIds(value) { return Array.isArray(value) && value.length <= 100 && new Set(value).size === value.length && value.every(entry => /^sa_rehearsal_(?:[1-9]|[1-9]\d|100)$/.test(entry)); }
function invalid() { throw new Error('Invalid Stream Avatars message'); }
function decodeClientMessage(raw) {
    let value;
    try { if (Buffer.byteLength(raw) > 65536) invalid(); value = JSON.parse(raw); } catch { invalid(); }
    if (value?.version !== 1) invalid();
    if (value.type === 'auth' && exact(value, ['version', 'type', 'token']) && typeof value.token === 'string' && value.token.length <= 256) return value;
    if (value.type === 'heartbeat' && exact(value, ['version', 'type'])) return value;
    if (value.type === 'diagnostic' && exact(value, ['version', 'type', 'code']) && ['missing-heart-image', 'unsupported-message', 'render-error', 'custom-service-required'].includes(value.code)) return value;
    if (value.type === 'ready' && exact(value, ['version', 'type', 'capabilities', 'resolution']) &&
        Array.isArray(value.capabilities) && value.capabilities.length <= 4 && value.capabilities.every(item => features.includes(item)) &&
        exact(value.resolution, ['width', 'height']) && positive(value.resolution.width) && positive(value.resolution.height)) return value;
    invalid();
}
function validateServerMessage(value) {
    if (value?.type === 'heartbeat' && exact(value, ['version', 'type', 'serverNowMs']) && value.version === 1 && finite(value.serverNowMs)) return value;
    if (!common(value)) invalid();
    if (value.type === 'clear' && exact(value, ['version', 'type', 'mode', 'generation'])) return value;
    if (value.type === 'crowd' && exact(value, ['version', 'type', 'mode', 'generation', 'crowdIds']) && value.mode === 'rehearsal' && crowdIds(value.crowdIds)) return value;
    if (value.type === 'hearts' && exact(value, ['version', 'type', 'mode', 'generation', 'sessionId', 'id', 'issuedAtMs', 'expiresAtMs', 'durationMs']) &&
        id(value.sessionId) && id(value.id) && finite(value.issuedAtMs) && finite(value.expiresAtMs) && value.expiresAtMs > value.issuedAtMs && value.expiresAtMs - value.issuedAtMs <= 10000 && value.durationMs === 5000) return value;
    if (value.type === 'snapshot' && exact(value, ['version', 'type', 'mode', 'generation', 'serverNowMs', 'session', 'elapsedMs', 'strip', 'rehearsal', 'features', 'render']) &&
        finite(value.serverNowMs) && finite(value.elapsedMs) && value.elapsedMs >= 0 &&
        exact(value.strip, ['x', 'y', 'width', 'height']) && finite(value.strip.x) && finite(value.strip.y) && positive(value.strip.width) && positive(value.strip.height) &&
        exact(value.render, ['maxHearts', 'heartOffset']) && Number.isInteger(value.render.maxHearts) && value.render.maxHearts > 0 && value.render.maxHearts <= 100 && finite(value.render.heartOffset) && value.render.heartOffset >= 0 &&
        exact(value.rehearsal, ['active', 'crowdIds']) && typeof value.rehearsal.active === 'boolean' && crowdIds(value.rehearsal.crowdIds) &&
        Array.isArray(value.features) && value.features.length <= 4 && value.features.every(item => features.includes(item))) {
        try { validateSessionState(value.session, { mode: value.mode, channel: value.session.channel }); } catch { invalid(); }
        return value;
    }
    invalid();
}
module.exports = { decodeClientMessage, validateServerMessage, crowdIds };
