const { publicCampaign } = require('../src/streamAvatars/protocol');
const { spawnSync } = require('node:child_process');
const { resolve, join } = require('node:path');
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { createCampaignState } = require('../src/streamAvatars/campaignState');
const { validateCampaignServerMessage: validateServerMessage } = require('../src/streamAvatars/protocol');
test.each(['phase-delayed-party-update', 'phase-ordered', 'phase-regression', 'phase-schema', 'phase-party-update', 'cooldown-boundary', 'cooldown-game-clock', 'cooldown-dance-once', 'cooldown-dance-rejected', 'cooldown-dance-upgrade', 'cooldown-dance-busy', 'cooldown-clear', 'cooldown-reload', 'cooldown-disconnect', 'cooldown-custom', 'cooldown-hug', 'cooldown-hug-reload', 'cooldown-invalid', 'recognition-delayed-extension', 'recognition-delayed-hug', 'recognition-delayed-suppression', 'native-null-hidden', 'native-null-goal-only', 'hug-crowd-1', 'hug-crowd-2', 'hug-crowd-3', 'hug-crowd-20', 'hug-crowd-101', 'hug-shuffle', 'hug-once', 'hug-busy', 'jump-busy', 'hug-recheck', 'hug-recheck-initiator', 'hug-unsafe', 'hug-exception', 'hug-party', 'hug-clear', 'hug-reload', 'hug-disconnect', 'hug-target-leaves', 'hug-takeover', 'caption-single', 'caption-batch', 'caption-cents', 'caption-hidden', 'caption-party', 'caption-shortening', 'caption-bounds', 'recognition-schema', 'async-dance-manual-interruption', 'async-dance-pending-avatar-reload', 'dance-wander', 'async-dance-alias', 'async-dance-tween', 'dance-other-animation', 'dance-avatar-change', 'async-dance-expiry', 'async-dance-reload', 'async-dance-cancel', 'async-dance-interrupted', 'async-dance-rejected', 'async-dance-existing', 'native-null-donation', 'native-null-goal', 'milestone-whole-dollars', 'confetti-scatter', 'celebration-pending-cap', 'celebration-stale', 'celebration-density', 'celebration-missing-confetti', 'celebration-missing-heart', 'celebration-delay-cancel', 'ordinary-101', 'milestone-banner', 'goal-banner', 'gear-preservation', 'celebration-faults', 'celebration-expiry', 'celebration-merge', 'celebration-late-join', 'celebration-cancel', 'address-ip', 'address-port', 'address-wss', 'address-ipv6', 'invalid-address', 'image-loaded-before-clear', 'image-pending-cap', 'missing-image-host', 'image-load-delay', 'image-load-timeout', 'pending-image-stop', 'host-json-escapes', 'auth', 'movement', 'density', 'cleanup', 'expiry', 'generation', 'crowd', 'invalid', 'missing-image', 'reconnect', 'late-join', 'empty-crowd', 'negative-bounds', 'resized-bounds', 'small-bounds', 'density-rotation', 'same-snapshot', 'new-campaign', 'stale-control', 'stop', 'close-open-race', 'socket-error', 'async-open', 'backoff', 'mailbox-burst', 'mailbox-overflow', 'malformed-json', 'invalid-snapshot', 'wrong-campaign', 'heartbeat-expiry', 'campaign-state', 'crowd-no-extra-config', 'reload', 'invalid-settings', 'invalid-token'])('shipped Lua companion: %s', scenario => {
    const result = spawnSync(process.env.LUA_BIN || 'lua', [resolve('tests/lua/companionHarness.lua'), resolve('integrations/stream-avatars/companion.lua'), scenario], { encoding: 'utf8', timeout: 5000 });
    if (result.error) throw new Error('Install Lua 5.2+ or set LUA_BIN: ' + result.error.code);
    expect({ status: result.status, stderr: result.stderr, stdout: result.stdout.trim() }).toEqual({ status: 0, stderr: '', stdout: 'OK ' + scenario });
});

function run(script, scenario, fixture) {
    return spawnSync(process.env.LUA_BIN || 'lua', [resolve('tests/lua/companionHarness.lua'), script, scenario, ...(fixture ? [fixture] : [])], { encoding: 'utf8', timeout: 5000 });
}
test('Lua consumes the actual Node protocol JSON, including nulls and UTF-8 fields', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sa-wire-'));
    try {
        const state = createCampaignState({ mode: 'integration', participantId: 'session_é' });
        const message = validateServerMessage({ version: 3, type: 'snapshot', mode: 'integration', generation: 1, serverNowMs: 1000, campaign: publicCampaign(state), integration: { active: true, crowdIds: [] }, features: ['hearts', 'crowd', 'campaign'] });
        const fixture = join(directory, 'snapshot.json'); writeFileSync(fixture, JSON.stringify(message));
        const result = run(resolve('integrations/stream-avatars/companion.lua'), 'wire-contract', fixture);
        expect({ status: result.status, stderr: result.stderr, stdout: result.stdout.trim() }).toEqual({ status: 0, stderr: '', stdout: 'OK wire-contract' });
    } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('companion works with Windows CRLF source and a script path containing spaces', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sa windows '));
    try {
        const script = join(directory, 'gaming computer companion.lua');
        writeFileSync(script, readFileSync(resolve('integrations/stream-avatars/companion.lua'), 'utf8').replace(/\r?\n/g, '\r\n'));
        const result = run(script, 'movement'); expect(result.status).toBe(0); expect(result.stdout.trim()).toBe('OK movement');
    } finally { rmSync(directory, { recursive: true, force: true }); }
});
// Prove these tests reject plausible defects, rather than merely executing happy paths.
test.each([
    ['phase-regression', 'value.phase=="recognition" and partySequences[value.sequenceId]', 'false'],
    ['phase-delayed-party-update', 'partySequenceId==value.sequenceId and partyWindowStartedAt==value.partyStartedAtMs', 'celebration and celebration.sequenceId==value.sequenceId and celebration.startedAtMs==value.partyStartedAtMs'],
    ['phase-party-update', 'local sameParty=partySequenceId==value.sequenceId and partyWindowStartedAt==value.partyStartedAtMs', 'local sameParty=false'],
    ['new-campaign', 'snapshot.campaign.campaignId~=value.campaign.campaignId', 'false'],
    ['cooldown-dance-once', 'and not actionAttempts[id] then', 'then'],
    ['cooldown-clear', 'if request[action] and now<request[action] then return false end', 'if false then return false end'],
    ['cooldown-reload', 'get("sa_action_requests") or {}', '{}'],
    ['cooldown-boundary', 'now+actionCooldowns[action]+1', 'now+actionCooldowns[action]'],
    ['recognition-delayed-extension', 'recognitionSequenceId==value.sequenceId and recognitionWindowStartedAt==value.recognitionStartedAtMs', 'recognition and recognition.startedAtMs==value.recognitionStartedAtMs'],
    ['hug-crowd-2', 'candidates[i+1]', 'candidates[i]'],
    ['hug-once', 'if not sameWindow then clearLayer(heartLayer); heartLayer={}; handled={} end', 'clearLayer(heartLayer); heartLayer={}; handled={}'],
    ['hug-busy', 'ordinaryState(user.getState()) end)', 'true end)'],
    ['hug-unsafe', 'target:match("^[A-Za-z0-9_:%-]+$")', 'true'],
    ['hug-crowd-2', 'initiator.runCommand("!{cmd:hug} "..target,true)', 'initiator.runCommand("!{cmd:hug} "..target,true); partner.runCommand("!{cmd:hug} "..tostring(initiator.id),true)'],
    ['ordinary-101', 'if i<=101 then', 'if i<=50 then'],
    ['celebration-pending-cap', 'if pending>=128 then return nil end', 'if false then return nil end'],
    ['milestone-banner', 'then user.exitState() end', 'then local ignored=true end'],
    ['pending-image-stop', 'entry.object.setScale(0,0)', 'entry.object.setScale(1,1)'],
    ['image-loaded-before-clear', 'status~="loaded"', 'true'],
    ['missing-image-host', 'deadline=elapsed+2', 'deadline=elapsed+20'],
    ['pending-image-stop', 'get(key)=="cancelled"', 'false'],
    ['image-pending-cap', 'pending>=100', 'false'],
    ['host-json-escapes', '#slashes % 2 == 1', 'false'],
    ['host-json-escapes', '#slashes % 2 == 1', 'true'],
    ['auth', 'token=settings.token', 'token="wrong-token"'],
    ['expiry', 'effect={ends=elapsed+5', 'effect={ends=elapsed+50'],
    ['expiry', 'value.expiresAtMs>elapsed*1000+serverOffset', 'true'],
    ['invalid', 'and not seen[value.id]', ''],
    ['stale-control', 'value.generation<generationFloor', 'false'],
    ['close-open-race', 'get("sa_disconnect_pending") or', 'false or'],
    ['density-rotation', 'rotation=rotation+MAX_HEARTS', 'rotation=0'],
    ['cleanup', 'pcall(entry.object.destroy)', 'pcall(function() end)'],
    ['movement', 'object.image.anchor("center",true)', 'object.image.anchor("bottom left",true)'],
    ['crowd', 'app.platformServiceSettings.SetUserLeave(id)', 'app.platformServiceSettings.SetUserLeave(900099)'],
    ['backoff', 'retryDelay=math.min(30,retryDelay*2)', 'retryDelay=math.min(60,retryDelay*2)']
])('Lua regression detects mutation %s / %s', (scenario, original, broken) => {
    const directory = mkdtempSync(join(tmpdir(), 'sa-mutation-'));
    try {
        const source = readFileSync(resolve('integrations/stream-avatars/companion.lua'), 'utf8');
        if (!source.includes(original)) throw new Error('Mutation target moved; update the behavioral mutation');
        const script = join(directory, 'companion.lua'); writeFileSync(script, source.replaceAll(original, broken));
        const result = run(script, scenario);
        expect(result.error).toBeUndefined(); expect(result.status).toBe(1); expect(result.stderr).toMatch(scenario === 'host-json-escapes' ? /escape changed value|invalid escape sequence/ : /assertion failed|must|density|disconnect|amount updates|delayed extension/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
});

test.each(['donation','milestone','goal','hidden','goal-only'])('Lua renders actual validated Node celebration JSON: %s', kind => {
    const directory = mkdtempSync(join(tmpdir(), 'sa-celebration-wire-'));
    try {
        const wireKind = kind === 'goal-only' ? 'goal' : kind === 'hidden' ? 'donation' : kind;
        const party = wireKind !== 'donation';
        const packet = validateServerMessage({ version: 3, type: 'celebration', mode: 'integration', generation: 1, campaignId: 'session', id: 'node-wire', sequenceId: 'node-sequence', issuedAtMs: 1000, expiresAtMs: 11000,
            phase: party ? 'party' : 'recognition', donationCount: party ? 0 : 1, donationTotalCents: party ? 0 : kind === 'hidden' ? null : 2500,
            recognitionStartedAtMs: party ? null : 1000, recognitionAction: party ? null : 'jump', heartsUntilMs: party ? 0 : 6000, partyStartedAtMs: party ? 1000 : null,
            partyUntilMs: wireKind === 'goal' ? 21000 : wireKind === 'milestone' ? 19000 : 0, kind: wireKind, campaignTotalCents: 154350, milestoneCents: kind === 'milestone' ? 150000 : null });
        const fixture = join(directory, 'celebration.json'); writeFileSync(fixture, JSON.stringify(packet));
        const result = run(resolve('integrations/stream-avatars/companion.lua'), 'wire-celebration', fixture);
        expect({ status: result.status, stderr: result.stderr, stdout: result.stdout.trim() }).toEqual({ status: 0, stderr: '', stdout: 'OK wire-celebration' });
    } finally { rmSync(directory, { recursive: true, force: true }); }
});

const { buildThemeCatalog, buildThemeLayout } = require('../src/streamAvatars/themeLayout');
const { candidate } = require('./fixtures/themeCandidates');
const themeScenarios = ['theme-donation-jump', 'theme-donation-hug', 'theme-donation-party', 'theme-wire-neutral', 'theme-stale-load', 'theme-shared-game', 'theme-neutral', 'theme-missing-backdrop', 'theme-missing-prop', 'theme-backdrop-timeout', 'theme-resize', 'theme-small-bounds', 'theme-heart-coexistence', 'theme-reconnect-no-entrance', 'theme-production-gate', 'theme-revision', 'theme-load-timeout', 'theme-pending-cap', 'theme-scope-cancellation', 'entrance-timing', 'entrance-obsolete', 'entrance-caption', 'entrance-neutral', 'entrance-supersession', 'theme-density-0', 'theme-density-20', 'theme-density-100', 'theme-kitchen', 'entrance-caption-error', 'entrance-position-error', 'entrance-unicode'];
function themeSource() {
    const manifest = candidate();
    for (const asset of Object.values(manifest.assets)) {
        const copy = { ...asset, assetId: asset.assetId.replace('block-world', 'kitchen'), theme: 'kitchen' };
        manifest.assets[copy.assetId] = copy;
    }
    const catalog = buildThemeCatalog({ manifest, previewOnly: true });
    const themes = Object.fromEntries(Object.entries(catalog.themes).map(([id, theme]) => [id, buildThemeLayout({ theme, packRevision: catalog.packRevision })]));
    return readFileSync(resolve('integrations/stream-avatars/companion.lua'), 'utf8').replace('local THEME_CATALOG_JSON = nil', `local THEME_CATALOG_JSON = [[${JSON.stringify({ profile: catalog.profile, previewOnly: true, packRevision: 'a'.repeat(64), themes })}]]`);
}
function runTheme(scenario, mutate = source => source) {
    const directory = mkdtempSync(join(tmpdir(), 'sa-theme-'));
    try {
        const script = join(directory, 'companion.lua'); writeFileSync(script, mutate(themeSource()));
        return run(script, scenario);
    } finally { rmSync(directory, { recursive: true, force: true }); }
}
test.each(themeScenarios)('lasting worlds and bounded entrances: %s', scenario => {
    const result = runTheme(scenario);
    expect({ status: result.status, stderr: result.stderr, stdout: result.stdout.trim() }).toEqual({ status: 0, stderr: '', stdout: 'OK ' + scenario });
});

test.each([
    ['theme-stale-load', 'get(key)=="cancelled"', 'false'],
    ['theme-stale-load', 'entry.object.setScale(0,0); entry.loader=async("sa_load_theme"', 'entry.object.setScale(1,1); entry.loader=async("sa_load_theme"'],
    ['theme-shared-game', 'if key==themeKey then return end', 'if false then return end'],
    ['theme-production-gate', 'not catalog.previewOnly or', 'true or'],
    ['theme-production-gate', 'and snapshot.integration.active', ''],
    ['theme-revision', 'theme.packRevision==catalog.packRevision', 'true'],
    ['theme-shared-game', 'layer="behindBackground",order=0', 'layer="background",order=0'],
    ['theme-resize', 'local scale=width/REFERENCE_WIDTH', 'local scale=1000/REFERENCE_WIDTH'],
    ['theme-pending-cap', 'if pending<100 then', 'if true then'],
    ['theme-missing-backdrop', 'release(entry); entry.skipped=true; themeDiagnostic()', 'clearTheme(); return'],
    ['theme-missing-backdrop', 'diagnostic("missing-theme-image")', 'do end'],
    ['theme-missing-backdrop', 'if elapsed>=themeDiagnosticAt then', 'if true then'],
    ['theme-backdrop-timeout', 'get(entry.key)=="failed" or elapsed>=entry.deadline then release(entry); entry.skipped=true', 'get(entry.key)=="failed" then release(entry); entry.skipped=true'],
    ['entrance-timing', 'ends=elapsed+6', 'ends=elapsed+60'],
    ['entrance-timing', 'value.expiresAtMs>elapsed*1000+serverOffset and value.durationMs==6000', 'true and value.durationMs==6000'],
    ['entrance-timing', 'and not seen[value.id] and', 'and'],
    ['entrance-obsolete', 'value.themeId==snapshot.theme.themeId', 'true'],
    ['entrance-obsolete', 'value.gameIdentity==snapshot.theme.gameIdentity', 'true'],
    ['entrance-caption', 'local keep=valid and code>=32 and code~=127 and code~=60 and code~=62', 'local keep=valid'],
    ['entrance-position-error', 'if not positioned then clearEntrance(); diagnostic("render-error") end', 'if not positioned then clearTheme(); clearEntrance(); diagnostic("render-error") end'],
    ['entrance-supersession', 'then clearEntrance() end', 'then end']
])('theme/entrance regression detects mutation %s / %s', (scenario, original, broken) => {
    const result = runTheme(scenario, source => {
        if (!source.includes(original)) throw new Error('Mutation target moved: ' + original);
        return source.replaceAll(original, broken);
    });
    expect(result.error).toBeUndefined(); expect(result.status).toBe(1); expect(result.stderr).toMatch(/assertion failed|must|requires active rehearsal/);
});

function runGear(scenario, mutate = source => source) {
    const setName = 'sa_helper_theme_hats';
    const gear = { small: { 'block-world': { slot: 'head', primary: { setName, pieceName: 'block_world_gear_mining_helmet' }, alternate: { setName, pieceName: 'block_world_gear_explorer_cap' }, fitRevision: 'b'.repeat(64) }, kitchen: { slot: 'head', primary: { setName, pieceName: 'kitchen_gear_chef_hat' }, fitRevision: 'b'.repeat(64) } } };
    const directory = mkdtempSync(join(tmpdir(), 'sa-gear-'));
    try {
        const source = readFileSync(resolve('integrations/stream-avatars/companion.lua'), 'utf8').replace('local THEME_CATALOG_JSON = nil', `local THEME_CATALOG_JSON = [[${JSON.stringify({ previewOnly: true, packRevision: 'a'.repeat(64), themes: {}, gear: { setName, avatars: gear } })}]]`);
        const script = join(directory, 'companion.lua'); writeFileSync(script, mutate(source)); return run(script, scenario);
    } finally { rmSync(directory, { recursive: true, force: true }); }
}
test.each(['gear-lifecycle', 'gear-alternate', 'gear-foreign', 'gear-avatar', 'gear-generation', 'gear-renew', 'gear-failure-expiry', 'gear-expired-owner', 'gear-disconnect', 'gear-gates', 'gear-large-list', 'gear-native-wrappers', 'gear-initial-occupied', 'gear-wall-pause', 'gear-clock-backwards', 'gear-clock-invalid', 'gear-permission', 'gear-host-error', 'gear-unsupported-read', 'gear-reload'])('owned finite head hats: %s', scenario => {
    const result = runGear(scenario); expect({ status: result.status, stderr: result.stderr, stdout: result.stdout.trim() }).toEqual({ status: 0, stderr: '', stdout: 'OK ' + scenario });
});
test.each([
    ['gear-foreign', 'effective[entry.setName]==entry.pieceName', 'true'],
    ['gear-wall-pause', 'gearNow<entry.expiresAt', 'true'],
    ['gear-renew', 'candidate.pieceName,30)', 'candidate.pieceName,0)'],
    ['gear-renew', 'renewAt=gearNow+10', 'renewAt=gearNow+25'],
    ['gear-gates', 'snapshot.theme.packRevision~=catalog.packRevision', 'false'],
    ['gear-generation', 'value.generation<generationFloor', 'false'],
    ['gear-large-list', 'for _,user in ipairs(getUsers()) do current', 'for i,user in ipairs(getUsers()) do if i>100 then break end; current'],
    ['gear-alternate', 'entry and wearable[entry.pieceName]', 'false and wearable[entry.pieceName]'],
    ['gear-native-wrappers', 'tostring(user.id)==id', 'user==entry.user'],
    ['gear-permission', 'if allowed then', 'if true then'],
    ['gear-renew', 'gearNow<entry.renewAt', 'false'],
    ['gear-initial-occupied', 'if not owns and occupied and', 'if false and occupied and'],
    ['gear-clock-backwards', 'now<gearNow', 'false']
])('temporary hat regression detects mutation %s / %s', (scenario, original, broken) => {
    const result = runGear(scenario, source => {
        if (!source.includes(original)) throw new Error('Mutation target moved: ' + original);
        const mutated = source.replaceAll(original, broken);
        return scenario === 'gear-wall-pause' ? mutated.replaceAll('gearNow>=entry.expiresAt', 'false') : mutated;
    });
    expect(result.error).toBeUndefined(); expect(result.status).toBe(1); expect(result.stderr).toMatch(/assertion failed|must|require|finite|stable/);
});
