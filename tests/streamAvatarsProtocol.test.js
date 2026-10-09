const { publicCampaign } = require('../src/streamAvatars/protocol');
const { decodeClientMessage, validateServerMessage } = require('../src/streamAvatars/protocol');
const { createCampaignState } = require('../src/streamAvatars/campaignState');
const snapshot = { version: 3, type: 'snapshot', mode: 'production', generation: 1, serverNowMs: 1000, campaign: publicCampaign(createCampaignState({ mode: 'production', participantId: '12' })), integration: { active: false, crowdIds: [] }, features: ['hearts', 'crowd', 'campaign'] };
test('accepts only finite typed protocol vocabulary', () => {
    expect(decodeClientMessage(JSON.stringify({ version: 3, type: 'auth', token: 'secret' })).type).toBe('auth');
    expect(decodeClientMessage(JSON.stringify({ version: 3, type: 'ready', capabilities: ['hearts'], resolution: { width: 1920, height: 1080 } })).type).toBe('ready');
    expect(validateServerMessage(snapshot)).toEqual(snapshot);
    expect(validateServerMessage({ version: 3, type: 'clear', mode: 'production', generation: 1 }).type).toBe('clear');
});
test.each(['{bad', JSON.stringify({ version: 3, type: 'command', text: 'loadstring' }), JSON.stringify({ version: 2, type: 'heartbeat' }), JSON.stringify({ version: 3, type: 'auth', token: 'secret', lua: 'execute' }), JSON.stringify({ version: 3, type: 'diagnostic', code: 'secret token' }), JSON.stringify({ version: 3, type: 'ready', capabilities: ['arbitrary-script'], resolution: { width: 0, height: 1 } })])('rejects malformed or executable client payload', raw => { expect(() => decodeClientMessage(raw)).toThrow('Invalid Stream Avatars message'); });
test.each([{ ...snapshot, elapsedMs: NaN }, { ...snapshot, generation: -1 }, { ...snapshot, campaign: { ...snapshot.campaign, totalCents: -1 } }, { version: 3, type: 'hearts', mode: 'production', generation: 1, campaignId: 's', id: 'i', issuedAtMs: 1000, expiresAtMs: 900, durationMs: 5000 }, { version: 3, type: 'crowd', mode: 'production', generation: 1, crowdIds: ['arbitrary user'] }])('rejects invalid server payload', value => { expect(() => validateServerMessage(value)).toThrow(/message/i); });

const recognitionPacket = { version: 3, type: 'celebration', mode: 'production', generation: 1, campaignId: '12', id: 'event', sequenceId: 'sequence', issuedAtMs: 1000, expiresAtMs: 11000, phase: 'recognition', kind: 'donation', campaignTotalCents: 50000, milestoneCents: null, donationCount: 2, donationTotalCents: 2500, recognitionStartedAtMs: 1000, recognitionAction: 'hug', heartsUntilMs: 6000, partyStartedAtMs: null, partyUntilMs: 0 };
test.each([{}, { donationTotalCents: null }])('recognition wire accepts bounded numeric/action metadata %j', patch => expect(validateServerMessage({ ...recognitionPacket, ...patch })).toMatchObject(patch));
test.each([{ donationCount: -1 }, { donationCount: 1.5 }, { donationCount: Number.MAX_SAFE_INTEGER + 1 }, { donationTotalCents: -1 }, { donationTotalCents: 1.2 }, { donationTotalCents: Number.MAX_SAFE_INTEGER + 1 }, { recognitionAction: 'explode' }, { recognitionStartedAtMs: 1001 }, { recognitionStartedAtMs: null }, { donationCount: 0 }, { recognitionStartedAtMs: 0, heartsUntilMs: 10001 }, { extra: 'command' }])('recognition wire rejects inconsistent metadata %j', patch => expect(() => validateServerMessage({ ...recognitionPacket, ...patch })).toThrow());

const { resolveGame, loadThemeConfiguration, PACK_REVISION } = require('../src/streamAvatars/themes');
const resolvedGame = resolveGame('Minecraft', loadThemeConfiguration().config);
const theme = { gameIdentity: resolvedGame.identity, gameName: 'Minecraft', themeId: 'block-world', packRevision: PACK_REVISION };
const entrance = { version: 3, type: 'game-entrance', mode: 'production', generation: 1, campaignId: 's', id: 'event', gameIdentity: resolvedGame.identity, themeId: 'block-world', issuedAtMs: 1000, expiresAtMs: 11000, durationMs: 6000 };
test('theme capability and exact theme snapshot use trusted IDs only', () => {
    expect(decodeClientMessage(JSON.stringify({ version: 3, type: 'ready', capabilities: ['hearts', 'crowd', 'campaign', 'themes'], resolution: { width: 1920, height: 1080 } })).capabilities).toContain('themes');
    expect(validateServerMessage({ ...snapshot, theme, features: ['themes'] }).theme).toEqual(theme);
    expect(validateServerMessage(entrance)).toEqual(entrance);
    expect(validateServerMessage({ ...entrance, themeId: null }).themeId).toBeNull();
});
test.each([{ gameIdentity: '../arbitrary' }, { gameName: 'a'.repeat(201) }, { gameName: 'Minecraft\u0000' }, { themeId: 'other' }, { packRevision: 'path/to/images' }, { gear: 'arbitrary' }])('rejects untrusted theme snapshot %j', patch => {
    expect(() => validateServerMessage({ ...snapshot, theme: { ...theme, ...patch } })).toThrow(/message/i);
});
test.each([{ gameIdentity: 'text-name' }, { themeId: 'other' }, { durationMs: 5000 }, { expiresAtMs: 10999 }, { issuedAtMs: -1 }, { gear: 'arbitrary' }])('rejects entrance vocabulary and timing drift %j', patch => {
    expect(() => validateServerMessage({ ...entrance, ...patch })).toThrow(/message/i);
});
test('entrance expiry must be a finite numeric timestamp rather than a coercible string', () => {
    expect(() => validateServerMessage({ ...entrance, expiresAtMs: '11000' })).toThrow(/message/i);
});
