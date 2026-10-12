const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { setTimeout: delay } = require('node:timers/promises');
const { startStreamAvatars } = require('./index');
const { createDonationSource } = require('../donations/source');
const scenarios = require('../../tests/fixtures/donations/integration-scenarios');
async function runIntegration({ listenerConfig, token, crowdCount = 20, scenario = 'all', recognition = 'random', signal, hueOutput, logger = console, wait = ms => delay(ms, undefined, { signal }), clock = { nowMs: Date.now }, timers }) {
    if (!['random','jump','hug'].includes(recognition)) throw new Error('Invalid integration recognition; use random, jump or hug');
    if (!Number.isInteger(crowdCount) || crowdCount < 0 || crowdCount > 100 || typeof token !== 'string' || token.length < 16 || token.length > 256) throw new Error('Invalid integration crowd/token configuration');
    const selected = scenarios.filter(item => scenario === 'all' || item.name === scenario);
    if (!selected.length) throw new Error('Unknown integration scenario');
    signal?.throwIfAborted();
    const directory = await fs.mkdtemp(join(tmpdir(), 'sa-integration-run-'));
    let service, source, finalTotalCents = 0;
    const completedScenarios = [];
    let donations = [], campaign = { sumDonations: 900, fundraisingGoal: 1000 };
    const check = () => { signal?.throwIfAborted(); };
    try {
        service = await startStreamAvatars({ config: { participantId: 'integration', webServer: listenerConfig,
            streamAvatars: { config: { token, stateDir: directory, donationIntervalCents: 50000 } } },
        integration: { recognitionAction: recognition, crowdIds: Array.from({ length: crowdCount }, (_, i) => 'sa_integration_' + (i + 1)) }, logger, realClock: clock, timers });
        logger.info(`Stream Avatars integration listener: ${service.address.address}:${service.address.port}. Import companion v3 and select Custom Lua.`, { address: service.address, stateDir: directory });
        const readyDeadline = clock.nowMs() + 60000;
        while (!service.getStatus().companionReady) { check(); if (clock.nowMs() >= readyDeadline) throw new Error('Companion v3 was not ready within 60000 ms'); await wait(100); }
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
        return { completedScenarios, finalTotalCents };
    } finally {
        source?.stop();
        try { await service?.stop(); } finally { try { await hueOutput?.stop(); } finally { await fs.rm(directory, { recursive: true, force: true }); } }
    }
}
module.exports = { runIntegration };
