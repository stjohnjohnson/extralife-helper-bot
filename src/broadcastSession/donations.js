const { addCents } = require('../donations/money');
const cents = value => Number.isSafeInteger(value) && value >= 0;
const time = value => Number.isSafeInteger(value) && value >= 0;
function validCampaign(value) {
    return value && time(value.observedAtMs) && cents(value.totalCents) && cents(value.goalCents) && value.goalCents > 0;
}
function donationFields(intervalCents = 50000) {
    return { donationLedger: {}, unknownAmountCount: 0, donationCheckpointCount: 0,
        donationIntervalCents: intervalCents, campaignObservation: null, pendingGoalDonationUntilMs: null };
}
function reduceDonations(state, { scan, campaign = null, reconcile = false, intervalCents = 50000, observedAtMs }) {
    if (!scan?.complete || !Array.isArray(scan.donations) || !time(scan.fromMs) || !time(scan.throughMs) || scan.throughMs < scan.fromMs || !time(observedAtMs) || !cents(intervalCents) || intervalCents === 0) throw new Error('Invalid authoritative donation scan');
    const next = { ...donationFields(intervalCents), ...structuredClone(state) };
    const diagnostics = new Set(), newIds = [];
    if (!next.sessionId || next.startedAtMs === null) return { state, intent: null, diagnostics: [] };
    if (String(scan.participantId) !== String(next.participantId) || scan.fromMs !== next.startedAtMs) throw new Error('Donation scan does not match session');
    const handled = new Set(next.processedDonationIds);
    const changedInterval = next.donationIntervalCents !== intervalCents;
    let historicalRevelation = false;
    for (const item of scan.donations) {
        if (!item || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 128 || String(item.participantId) !== String(next.participantId) || !time(item.createdAtMs) || (item.amountCents !== null && !cents(item.amountCents))) {
            diagnostics.add('invalid-donation'); continue;
        }
        if (item.createdAtMs < next.startedAtMs || item.createdAtMs > scan.throughMs || (next.endedAtMs !== null && item.createdAtMs >= next.endedAtMs)) continue;
        const old = Object.hasOwn(next.donationLedger, item.id) ? next.donationLedger[item.id] : null;
        if (handled.has(item.id)) {
            // Legacy handled IDs can have no facts: do not invent or re-add their money.
            if (!old) continue;
            if (old.createdAtMs !== item.createdAtMs || (old.amountCents !== null && item.amountCents !== null && old.amountCents !== item.amountCents)) { diagnostics.add('conflicting-donation'); continue; }
            if (old.amountCents === null && item.amountCents !== null) {
                next.liveTotalCents = addCents(next.liveTotalCents, item.amountCents);
                old.amountCents = item.amountCents; next.unknownAmountCount--; historicalRevelation = true;
            }
            continue;
        }
        Object.defineProperty(next.donationLedger, item.id, { value: { createdAtMs: item.createdAtMs, amountCents: item.amountCents }, enumerable: true, writable: true, configurable: true });
        handled.add(item.id); next.processedDonationIds.push(item.id); newIds.push(item.id);
        if (item.amountCents === null) next.unknownAmountCount++;
        else next.liveTotalCents = addCents(next.liveTotalCents, item.amountCents);
    }
    const count = Math.floor(next.liveTotalCents / intervalCents);
    const previousCount = changedInterval ? count : next.donationCheckpointCount;
    next.donationIntervalCents = intervalCents;
    next.donationCheckpointCount = Math.max(previousCount, count);
    // Full history is the high-water count. Keep a bounded list for small/legacy consumers.
    const checkpoints = new Set(changedInterval ? [] : next.reachedDonationCheckpoints);
    for (let i = Math.max(1, previousCount + 1); i <= Math.min(count, previousCount + 999); i++) checkpoints.add(i * intervalCents);
    if (count > 0) checkpoints.add(count * intervalCents);
    next.reachedDonationCheckpoints = [...checkpoints].sort((a,b) => a-b).slice(-1000);
    const silent = reconcile || next.endedAtMs !== null;
    if (!silent && newIds.length && scan.donations.some(item => newIds.includes(item.id) && (item.amountCents === null || item.amountCents > 0))) next.pendingGoalDonationUntilMs = observedAtMs + 120000;
    let goalReached = false;
    if (validCampaign(campaign) && (!next.campaignObservation || campaign.observedAtMs > next.campaignObservation.observedAtMs)) {
        const old = next.campaignObservation;
        const met = campaign.totalCents >= campaign.goalCents;
        const changedGoal = old && old.goalCents !== campaign.goalCents;
        goalReached = !silent && !next.campaignGoalReached && old !== null && !changedGoal &&
            old.totalCents < old.goalCents && met && next.pendingGoalDonationUntilMs !== null && observedAtMs <= next.pendingGoalDonationUntilMs;
        if (met && (silent || !old || changedGoal || goalReached)) next.campaignGoalReached = true;
        next.campaignObservation = structuredClone(campaign);
    }
    const milestoneCents = !silent && !changedInterval && !historicalRevelation && count > previousCount && newIds.length ? count * intervalCents : null;
    const intent = !silent && (newIds.length || goalReached) ? { sessionId: next.sessionId, donationIds: newIds,
        liveTotalCents: next.liveTotalCents, milestoneCents, goalReached } : null;
    return { state: next, intent, diagnostics: [...diagnostics] };
}
module.exports = { reduceDonations, donationFields, validCampaign };
