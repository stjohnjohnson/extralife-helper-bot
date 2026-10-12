const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { setTimeout: delay } = require('node:timers/promises');
const { startStreamAvatars } = require('./index');
const { createDonationSource } = require('../donations/source');
const { THEME_IDS, cleanGameName } = require('./themes');
const { resolveIntegrationPack } = require('./integrationPack');
const scenarios = require('../../tests/fixtures/donations/integration-scenarios');
async function runIntegration({ listenerConfig, token, crowdCount = 20, scenario = 'all', recognition = 'random', theme, game, candidatePackDir, themePackDir, signal, hueOutput, logger = console, wait = ms => delay(ms, undefined, { signal }), clock = { nowMs: Date.now }, timers }) {
    if (!['random','jump','hug'].includes(recognition)) throw new Error('Invalid integration recognition; use random, jump or hug');
    if (!Number.isInteger(crowdCount) || crowdCount < 0 || crowdCount > 100 || typeof token !== 'string' || token.length < 16 || token.length > 256) throw new Error('Invalid integration crowd/token configuration');
    if (game !== undefined && cleanGameName(game) === null) throw new Error('Invalid integration game name');
    if (theme !== undefined && ![...THEME_IDS, 'all', 'neutral'].includes(theme)) throw new Error('Unknown integration theme');
    if (theme !== undefined && game !== undefined) throw new Error('Choose --theme or --game');
    if (theme === 'all' && !['all','themes'].includes(scenario)) throw new Error('--theme all requires --scenario all or themes');
    const themed = scenario === 'all' || scenario === 'themes' || theme !== undefined || game !== undefined;
    const focusedTheme = game !== undefined ? { gameName: game } : theme !== undefined && theme !== 'all' ? { theme } : null;
    const selected = scenarios.filter(item => scenario === 'all' || item.name === scenario);
    if (!selected.length && scenario !== 'themes') throw new Error('Unknown integration scenario');
    signal?.throwIfAborted();
    const pack = resolveIntegrationPack({ candidatePackDir, themePackDir, required: themed });
    ({ candidatePackDir, themePackDir } = pack);
    const directory = await fs.mkdtemp(join(tmpdir(), 'sa-integration-run-'));
    let service, source, finalTotalCents = 0;
    const completedScenarios = [];
    let donations = [], campaign = { sumDonations: 900, fundraisingGoal: 1000 };
    let visualFailure;
    const requiredFailures = new Set(['render-error','custom-service-required', ...(themed ? ['missing-theme-image','theme-render-error'] : []), ...(selected.length ? ['missing-heart-image','missing-celebration-image'] : [])]);
    const integrationLogger = { ...logger, warn(message, details) {
        if (message === 'Stream Avatars companion diagnostic') {
            if (requiredFailures.has(details?.code)) visualFailure ||= new Error(`Companion reported ${details.code}; import the matching campaign/theme ZIP and select Custom Lua before rerunning the integration preview.`);
        }
        logger.warn(message, details);
    } };
    const check = () => { signal?.throwIfAborted(); if (visualFailure) throw visualFailure; };
    try {
        service = await startStreamAvatars({ config: { participantId: 'integration', webServer: listenerConfig,
            streamAvatars: { config: { token, stateDir: directory, donationIntervalCents: 50000 } } },
        integration: { recognitionAction: recognition, crowdIds: Array.from({ length: crowdCount }, (_, i) => 'sa_integration_' + (i + 1)) }, logger: integrationLogger, realClock: clock, timers, candidatePackDir, themePackDir });
        logger.info(`Stream Avatars integration listener: ${service.address.address}:${service.address.port}. Import companion v3 and select Custom Lua.`, { address: service.address, stateDir: directory });
        if (pack.packRevision) logger.info(`Integration ${candidatePackDir ? 'candidate preview' : 'approved'} theme pack: ${pack.packRevision}. Import the ZIP built from this same directory.`, { packRevision: pack.packRevision });
        const readyDeadline = clock.nowMs() + 60000;
        while (!service.getStatus().companionReady || (themed && !service.getStatus().themeReady)) { check(); if (clock.nowMs() >= readyDeadline) throw new Error(themed ? 'Companion v3 was not ready within 60000 ms; this preview requires themes capability and the matching imported theme ZIP.' : 'Companion v3 was not ready within 60000 ms'); await wait(100); }
        check();
        if (hueOutput && !await hueOutput.initialize()) throw new Error('Optional Hue initialization failed');
        source = createDonationSource({ clock, requestGapMs: 0, fetch: async url => {
            check(); const isDonations = new URL(url).pathname.endsWith('/donations');
            return { status: 200, headers: new Headers({ 'api-version': '1.4', ...(isDonations ? { 'num-records': String(donations.length) } : {}) }), json: async () => isDonations ? [...donations].reverse() : campaign };
        } });
        const poll = async () => {
            check(); const checkpoint = service.getPollCheckpoint(), batchId = randomUUID();
            let delivered = false;
            const accept = async fields => {
                check(); const result = await service.acceptObservation({ expectedEpochId: checkpoint.epochId, batchId, ...fields, observedAtMs: clock.nowMs() });
                delivered ||= Boolean(result.delivered); return result;
            };
            const result = await source.pollCampaignDonations({ participantId: 'integration', checkpoint, signal, onDonations: accept });
            await accept(result);
            const observedCampaign = await source.readCampaign({ participantId: 'integration', signal });
            await accept({ campaign: observedCampaign });
            return { delivered, campaignTotalCents: service.getStatus().campaignTotalCents };
        };
        for (const item of selected) {
            check(); if (!service.getStatus().companionReady) throw new Error('Companion disconnected before scenario');
            await service.resetIntegration(); donations = []; campaign = { sumDonations: item.startingCampaignCents / 100, fundraisingGoal: item.goalCents / 100 };
            const gift = (id, cents) => ({ donationID: id, participantID: 'integration', createdDateUTC: new Date(clock.nowMs()).toISOString(), amount: cents / 100, displayName: item.anonymous ? null : 'Integration gift', isRegFee: false });
            await poll(); await wait(500); check();
            if (focusedTheme) {
                if (!service.getStatus().themeReady) throw new Error('Theme companion disconnected before preview');
                const preview = await service.previewGame(focusedTheme);
                if (preview.changed && !preview.delivered) throw new Error('Theme preview was not dispatched');
                logger.info(`Theme preview ${theme || game}: dispatched; verify scenery and caption visually.`);
            }
            for (const [index,cents] of item.gifts.entries()) donations.push(gift(item.name + '-' + index,cents));
            campaign.sumDonations = item.totalCents / 100;
            logger.info(`${item.name}: next ${item.caption} for 5s${item.partyCaption ? '; then ' + item.partyCaption : ''}.`);
            const result = await poll();
            if (!result?.delivered || result.campaignTotalCents !== item.totalCents) throw new Error('Scenario was not dispatched to a ready companion');
            logger.info(`${item.name}: expect ${item.caption} for 5s; dispatched. Verify visually.`);
            if (item.partyCaption) logger.info(`${item.name}: then expect ${item.partyCaption} for ${item.kind === 'goal' ? 20 : 18}s; verify visually.`);
            if (hueOutput) void hueOutput.celebrateDonation().catch(() => logger.warn('Optional Hue celebration failed'));
            await wait(item.durationMs + 250); check();
            finalTotalCents = service.getStatus().campaignTotalCents; completedScenarios.push(item.name);
        }
        if (scenario === 'all' || scenario === 'themes') {
            if (scenario === 'all') await service.previewGame({ theme: 'neutral', announce: false });
            const steps = scenario === 'all' || ((theme === undefined || theme === 'all') && game === undefined) ? [
                ...THEME_IDS.map(value => ({ theme: value })), { gameName: 'Raft' }, { gameName: 'PEAK' }, { gameName: 'Minecraft Bedrock' }, { theme: 'neutral' }
            ] : [game !== undefined ? { gameName: game } : { theme: theme || 'neutral' }];
            for (const step of steps) {
                check(); if (!service.getStatus().themeReady) throw new Error('Theme companion disconnected before preview');
                const result = await service.previewGame(step);
                if (result.changed && !result.delivered) throw new Error('Theme preview was not dispatched');
                logger.info(`Theme preview ${step.theme || step.gameName}: dispatched; verify scenery and caption visually.`);
                await wait(6500); check();
                if (!service.getStatus().themeReady) throw new Error('Theme companion disconnected before preview completed');
                completedScenarios.push(step.theme || step.gameName);
            }
        }
        return { completedScenarios, finalTotalCents };
    } finally {
        source?.stop();
        try { await service?.stop(); } finally { try { await hueOutput?.stop(); } finally { await fs.rm(directory, { recursive: true, force: true }); } }
    }
}
module.exports = { runIntegration };
