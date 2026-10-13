const { cleanGameName, THEME_IDS } = require('./themes');
const validGameIdentity = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validThemeId = value => value === null || THEME_IDS.includes(value);
const finite = value => Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
const exact = (value, keys) => value && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function crowdIds(value) { return Array.isArray(value) && value.length <= 100 && new Set(value).size === value.length && value.every(entry => /^sa_integration_(?:[1-9]|[1-9]\d|100)$/.test(entry)); }
function validTheme(value) {
    return value === null || (exact(value, ['gameIdentity','gameName','themeId','packRevision']) && validGameIdentity(value.gameIdentity) &&
        cleanGameName(value.gameName) === value.gameName && value.gameName !== null && validThemeId(value.themeId) && validGameIdentity(value.packRevision));
}
function invalid() { throw new Error('Invalid Stream Avatars message'); }
function validRecognition(value) {
    const safe = n => Number.isSafeInteger(n) && n >= 0;
    if (!safe(value.donationCount) || !(value.donationTotalCents === null || safe(value.donationTotalCents))) return false;
    if (value.donationCount === 0) return value.donationTotalCents === 0 && value.recognitionStartedAtMs === null && value.recognitionAction === null && value.heartsUntilMs === 0;
    return safe(value.recognitionStartedAtMs) && value.recognitionStartedAtMs <= value.issuedAtMs &&
        value.heartsUntilMs >= value.recognitionStartedAtMs && value.heartsUntilMs <= value.recognitionStartedAtMs + 10000 &&
        ['jump', 'hug'].includes(value.recognitionAction);
}
const campaignFeatures = ['hearts', 'crowd', 'campaign', 'celebrations', 'donation-recognition', 'themes'];
const safeCents = n => Number.isSafeInteger(n) && n >= 0;
function decodeCampaignClientMessage(raw) {
    let value;
    try { if (Buffer.byteLength(raw) > 65536) invalid(); value = JSON.parse(raw); } catch { invalid(); }
    if (value?.version !== 3) invalid();
    if (value.type === 'auth' && exact(value, ['version','type','token']) && typeof value.token === 'string' && value.token.length <= 256) return value;
    if (value.type === 'heartbeat' && exact(value, ['version','type'])) return value;
    if (value.type === 'diagnostic' && exact(value, ['version','type','code']) && ['missing-heart-image','missing-celebration-image','unsupported-message','render-error','custom-service-required','action-error','density-limit','missing-theme-image','theme-render-error'].includes(value.code)) return value;
    if (value.type === 'ready' && exact(value, ['version','type','capabilities','resolution']) && Array.isArray(value.capabilities) &&
        value.capabilities.length <= 6 && new Set(value.capabilities).size === value.capabilities.length && value.capabilities.every(f => campaignFeatures.includes(f)) &&
        exact(value.resolution,['width','height']) && positive(value.resolution.width) && positive(value.resolution.height)) return value;
    invalid();
}
function validPublicCampaign(c) {
    if (!exact(c,['campaignId','initialized','totalCents','goalCents','nextMilestoneCents','goalHandled']) || !id(c.campaignId) || typeof c.initialized !== 'boolean' || typeof c.goalHandled !== 'boolean') return false;
    if (!c.initialized) return c.totalCents === null && c.goalCents === null && c.nextMilestoneCents === null;
    return safeCents(c.totalCents) && safeCents(c.goalCents) && c.goalCents > 0 && (c.nextMilestoneCents === null || (safeCents(c.nextMilestoneCents) && c.nextMilestoneCents > c.totalCents));
}
function publicCampaign(state) {
    const c = state.campaignObservation;
    const next = c ? (state.donationCheckpointCount + 1) * state.donationIntervalCents : null;
    return { campaignId: state.participantId, initialized: Boolean(c), totalCents: c?.totalCents ?? null, goalCents: c?.goalCents ?? null,
        nextMilestoneCents: safeCents(next) ? next : null, goalHandled: state.goalHandled };
}
function validateCampaignServerMessage(value) {
    if (value?.version !== 3) invalid();
    if (value.type === 'heartbeat' && exact(value,['version','type','serverNowMs']) && finite(value.serverNowMs)) return value;
    if (!['production','integration'].includes(value.mode) || !safeCents(value.generation)) invalid();
    if (value.type === 'clear' && exact(value,['version','type','mode','generation'])) return value;
    if (value.type === 'crowd' && exact(value,['version','type','mode','generation','crowdIds']) && value.mode === 'integration' && crowdIds(value.crowdIds)) return value;
    if (value.type === 'snapshot' && exact(value,['version','type','mode','generation','serverNowMs','campaign','integration','features', ...(Object.hasOwn(value, 'theme') ? ['theme'] : [])]) && (!Object.hasOwn(value, 'theme') || validTheme(value.theme)) && finite(value.serverNowMs) && validPublicCampaign(value.campaign) &&
        exact(value.integration,['active','crowdIds']) && typeof value.integration.active === 'boolean' && crowdIds(value.integration.crowdIds) && Array.isArray(value.features) &&
        value.features.length <= 6 && new Set(value.features).size === value.features.length && value.features.every(f => campaignFeatures.includes(f))) return value;
    if (value.type === 'hearts' && exact(value,['version','type','mode','generation','campaignId','id','issuedAtMs','expiresAtMs','durationMs']) && id(value.campaignId) && id(value.id) &&
        safeCents(value.issuedAtMs) && safeCents(value.expiresAtMs) && value.expiresAtMs > value.issuedAtMs && value.expiresAtMs <= value.issuedAtMs + 10000 && value.durationMs === 5000) return value;
    if (value.type === 'game-entrance' && exact(value,['version','type','mode','generation','campaignId','id','gameIdentity','themeId','issuedAtMs','expiresAtMs','durationMs']) &&
        id(value.campaignId) && id(value.id) && validGameIdentity(value.gameIdentity) && validThemeId(value.themeId) && safeCents(value.issuedAtMs) &&
        safeCents(value.expiresAtMs) && value.expiresAtMs - value.issuedAtMs === 10000 && value.durationMs === 6000) return value;
    if (value.type !== 'celebration' || !exact(value,['version','type','mode','generation','campaignId','id','sequenceId','issuedAtMs','expiresAtMs','phase','kind','campaignTotalCents','milestoneCents','donationCount','donationTotalCents','recognitionStartedAtMs','recognitionAction','heartsUntilMs','partyStartedAtMs','partyUntilMs']) ||
        !id(value.campaignId) || !id(value.id) || !id(value.sequenceId) || !safeCents(value.issuedAtMs) || !safeCents(value.expiresAtMs) || value.expiresAtMs <= value.issuedAtMs || value.expiresAtMs > value.issuedAtMs + 10000 ||
        !(value.campaignTotalCents === null || safeCents(value.campaignTotalCents)) || !(value.milestoneCents === null || (safeCents(value.milestoneCents) && value.milestoneCents > 0 && value.campaignTotalCents !== null && value.milestoneCents <= value.campaignTotalCents)) ||
        !safeCents(value.heartsUntilMs) || !safeCents(value.partyUntilMs) || !validRecognition(value)) invalid();
    if (value.phase === 'recognition' && value.kind === 'donation' && value.donationCount > 0 && value.heartsUntilMs > value.issuedAtMs && value.milestoneCents === null && value.partyStartedAtMs === null && value.partyUntilMs === 0) return value;
    if (value.phase === 'party' && ['milestone','goal'].includes(value.kind) && (value.kind !== 'milestone' || value.milestoneCents !== null) && value.donationCount === 0 && value.campaignTotalCents !== null &&
        safeCents(value.partyStartedAtMs) && value.partyStartedAtMs <= value.issuedAtMs && value.partyUntilMs > value.issuedAtMs && value.partyUntilMs <= value.partyStartedAtMs + 38000) return value;
    invalid();
}
module.exports = { decodeClientMessage: decodeCampaignClientMessage, validateServerMessage: validateCampaignServerMessage, decodeCampaignClientMessage, validateCampaignServerMessage, publicCampaign, crowdIds };
