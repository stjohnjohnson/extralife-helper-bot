const { addCents } = require('../donations/money');
const safe = n => Number.isSafeInteger(n) && n >= 0;
const id = s => typeof s === 'string' && s.length > 0 && s.length <= 128;
const ids = list => Array.isArray(list) && list.every(id) && new Set(list).size === list.length;
const validCampaign = c => c && safe(c.observedAtMs) && safe(c.totalCents) && safe(c.goalCents) && c.goalCents > 0 && Object.keys(c).length === 3;
const checkpoints = (total, interval) => Number(BigInt(total) / BigInt(interval));
function createCampaignState({ mode, participantId, intervalCents = 50000 }) {
    return { schemaVersion: 1, mode, participantId: String(participantId), revision: 0, baselineAtMs: null, donationBaselineReady: false,
        rawSeenDonationIds: [], processedDonationIds: [], recordCount: null, campaignObservation: null, donationIntervalCents: intervalCents,
        donationCheckpointCount: 0, goalHandled: false };
}
function validateCampaignState(value, { mode, participantId }) {
    const keys = Object.keys(createCampaignState({ mode, participantId }));
    if (!value || Object.keys(value).length !== keys.length || !keys.every(k => Object.hasOwn(value, k)) || value.schemaVersion !== 1 ||
        !['production', 'integration'].includes(value.mode) || value.mode !== mode || !id(value.participantId) || value.participantId !== String(participantId) ||
        !safe(value.revision) || !(value.baselineAtMs === null || safe(value.baselineAtMs)) || typeof value.donationBaselineReady !== 'boolean' ||
        !ids(value.rawSeenDonationIds) || !ids(value.processedDonationIds) || !(value.recordCount === null || safe(value.recordCount)) ||
        !(value.campaignObservation === null || validCampaign(value.campaignObservation)) || !safe(value.donationIntervalCents) || value.donationIntervalCents < 1 || value.donationIntervalCents > 100000000 ||
        !safe(value.donationCheckpointCount) || typeof value.goalHandled !== 'boolean') throw new Error('Invalid campaign state');
    return structuredClone(value);
}
function reduceCampaignProgress(state, { batchId, donations = [], rawSeenIds, recordCount, complete = false, campaign, observedAtMs, throughMs = observedAtMs, baseline = false, campaignBaseline = false, intervalCents = 50000 }, { pendingConfirmations = [] } = {}) {
    if (!id(batchId) || !safe(throughMs) || throughMs > observedAtMs || !safe(observedAtMs) || !Array.isArray(donations) || !safe(intervalCents) || intervalCents < 1 || intervalCents > 100000000 ||
        (rawSeenIds !== undefined && !ids(rawSeenIds)) || (recordCount !== undefined && recordCount !== null && !safe(recordCount))) throw new Error('Invalid campaign input');
    const next = structuredClone(state), diagnostics = new Set(), fresh = [];
    const seen = new Set(next.processedDonationIds);
    let pending = pendingConfirmations.filter(p => p.expiresAtMs >= observedAtMs).map(p => ({ ...p }));
    let amount = 0, positive = false;
    // Public API records may have only whole-second precision. Baseline IDs
    // suppress history while the timestamp fence admits newly visible same-second gifts.
    if (baseline && complete) next.baselineAtMs = Math.floor(throughMs / 1000) * 1000;
    for (const donation of donations) {
        if (!donation || !id(donation.id) || String(donation.participantId) !== next.participantId || !safe(donation.createdAtMs) || donation.createdAtMs > observedAtMs ||
            !(donation.amountCents === null || safe(donation.amountCents))) { diagnostics.add('invalid-donation'); continue; }
        if (seen.has(donation.id)) continue;
        seen.add(donation.id); next.processedDonationIds.push(donation.id);
        if (baseline || (next.baselineAtMs !== null && donation.createdAtMs < next.baselineAtMs)) continue;
        fresh.push(donation.id);
        amount = amount === null || donation.amountCents === null ? null : addCents(amount, donation.amountCents);
        positive ||= donation.amountCents === null || donation.amountCents > 0;
    }
    if (complete) {
        next.donationBaselineReady = true;
        if (rawSeenIds !== undefined) next.rawSeenDonationIds = [...new Set([...next.rawSeenDonationIds, ...rawSeenIds])];
        if (recordCount !== undefined) next.recordCount = recordCount;
    }
    if (positive) {
        pending = pending.filter(p => p.batchId !== batchId);
        pending.push({ batchId, acceptedAtMs: observedAtMs, expiresAtMs: observedAtMs + 120000 });
    }
    let milestoneCents = null, goalReached = false, rewardBatchId = batchId;
    const changedInterval = next.donationIntervalCents !== intervalCents;
    next.donationIntervalCents = intervalCents;
    if (validCampaign(campaign) && (!next.campaignObservation || campaign.observedAtMs > next.campaignObservation.observedAtMs)) {
        const old = next.campaignObservation;
        const silent = baseline || campaignBaseline || !old;
        const count = checkpoints(campaign.totalCents, intervalCents);
        const correlation = pending.find(p => p.batchId === batchId) ?? pending.at(-1);
        if (!silent && !changedInterval && count > next.donationCheckpointCount && correlation) milestoneCents = count * intervalCents;
        const changedGoal = old && old.goalCents !== campaign.goalCents;
        const met = campaign.totalCents >= campaign.goalCents;
        goalReached = !silent && !changedGoal && !next.goalHandled && old.totalCents < old.goalCents && met && Boolean(correlation);
        if (met) next.goalHandled = true;
        if (milestoneCents !== null || goalReached) rewardBatchId = correlation.batchId;
        next.donationCheckpointCount = changedInterval ? count : Math.max(next.donationCheckpointCount, count);
        next.campaignObservation = structuredClone(campaign);
        if (silent) pending = [];
    } else if (campaign !== undefined && !validCampaign(campaign)) diagnostics.add('invalid-campaign');
    if (changedInterval && next.campaignObservation) next.donationCheckpointCount = checkpoints(next.campaignObservation.totalCents, intervalCents);
    const intent = fresh.length || milestoneCents !== null || goalReached ? { batchId: rewardBatchId, donationIds: fresh, donationCount: fresh.length,
        donationTotalCents: amount, campaignTotalCents: next.campaignObservation?.totalCents ?? null, milestoneCents, goalReached } : null;
    return { state: next, intent, diagnostics: [...diagnostics], pendingConfirmations: pending };
}
module.exports = { createCampaignState, validateCampaignState, reduceCampaignProgress, validCampaign };
