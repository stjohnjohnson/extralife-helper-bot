const { addCents } = require('../donations/money');
const { normalizeDonationDisplayName } = require('../donations/displayName');
const safe = n => Number.isSafeInteger(n) && n >= 0;
const id = s => typeof s === 'string' && s.length > 0 && s.length <= 128;
function validateIntent(intent) {
    if (!id(intent.batchId) || !Array.isArray(intent.donationIds) || !intent.donationIds.every(id) || new Set(intent.donationIds).size !== intent.donationIds.length ||
        !safe(intent.donationCount) || intent.donationCount !== intent.donationIds.length || !Array.isArray(intent.donations) || intent.donations.length !== intent.donationCount ||
        !(intent.donationTotalCents === null || safe(intent.donationTotalCents)) || !(intent.campaignTotalCents === null || safe(intent.campaignTotalCents)) ||
        !(intent.milestoneCents === null || (safe(intent.milestoneCents) && intent.milestoneCents > 0 && intent.campaignTotalCents !== null && intent.milestoneCents <= intent.campaignTotalCents)) ||
        typeof intent.goalReached !== 'boolean') throw new Error('Invalid campaign celebration intent');
    let amount = 0;
    for (const [index, donation] of intent.donations.entries()) {
        if (!donation || donation.id !== intent.donationIds[index] || typeof donation.displayName !== 'string' || normalizeDonationDisplayName(donation.displayName) !== donation.displayName ||
            !(donation.amountCents === null || safe(donation.amountCents))) throw new Error('Invalid individual donation');
        amount = amount === null || donation.amountCents === null ? null : addCents(amount, donation.amountCents);
    }
    if (amount !== intent.donationTotalCents) throw new Error('Invalid donation total');
}
function createCampaignCelebrationComposer({ clock, random = Math.random, newSequenceId = require('node:crypto').randomUUID }) {
    let active = null, queue = [], late = [], batches = new Map(), known = new Set(), paused = false, stopped = false;
    const message = g => ({ sequenceId: g.sequenceId, phase: g.phase, kind: g.phase === 'recognition' ? 'donation' : g.reward,
        donorName: g.phase === 'recognition' ? g.name : null, replay: g.replay,
        campaignTotalCents: g.campaignTotal, milestoneCents: g.phase === 'party' ? g.milestone : null,
        donationCount: g.phase === 'recognition' ? 1 : 0, donationTotalCents: g.phase === 'recognition' ? g.amount : 0,
        recognitionStartedAtMs: g.phase === 'recognition' ? g.startedAt : null, recognitionAction: g.phase === 'recognition' ? g.action : null,
        heartsUntilMs: g.phase === 'recognition' ? g.until : 0, partyStartedAtMs: g.phase === 'party' ? g.partyStartedAt : null,
        partyUntilMs: g.phase === 'party' ? g.until : 0 });
    const hasReward = g => g.reward === 'goal' ? !g.goalShown : g.reward === 'milestone' && !g.rewardShown;
    function recognize(g, now) {
        const draw = random();
        if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error('Invalid recognition randomness');
        g.action = draw < 0.5 ? 'jump' : 'hug'; g.phase = 'recognition'; g.startedAt = now; g.until = now + 15000; g.replay = false;
        return message(g);
    }
    function party(g, now) {
        g.phase = 'party'; g.partyStartedAt = now; g.until = now + (g.reward === 'goal' ? 20000 : 18000);
        g.rewardShown = true; g.goalShown ||= g.reward === 'goal'; g.replay = false;
        return message(g);
    }
    function advance() {
        if (stopped || paused) return [];
        const now = clock.nowMs(), messages = [];
        for (const [key, batch] of batches) if (batch.expiresAt < now && batch.tail.phase === 'completed' && !late.includes(batch.tail)) batches.delete(key);
        if (active && active.until <= now) {
            if (active.phase === 'recognition' && hasReward(active)) messages.push(party(active, now));
            else { active.phase = 'completed'; active = null; }
        }
        if (!active) {
            if (late.length) { active = late.shift(); messages.push(party(active, now)); }
            else if (queue.length) { active = queue.shift(); messages.push(recognize(active, now)); }
        }
        return messages;
    }
    function accept(intent) {
        if (stopped) return [];
        validateIntent(intent);
        const previous = structuredClone({ active, queue, late, batches, known });
        try {
            const now = clock.nowMs(), messages = advance();
            const fresh = intent.donations.filter(d => !known.has(d.id));
            if (fresh.length && fresh.length !== intent.donationCount) throw new Error('Partially duplicated campaign intent');
            let batch = batches.get(intent.batchId);
            if (fresh.length) {
                for (const donation of fresh) {
                    known.add(donation.id);
                    const entry = { sequenceId: newSequenceId(), name: donation.displayName, amount: donation.amountCents,
                        campaignTotal: intent.campaignTotalCents, milestone: null, reward: null, rewardShown: false, goalShown: false,
                        phase: 'pending', startedAt: null, partyStartedAt: null, until: 0, action: null, replay: false };
                    queue.push(entry);
                    batch = { tail: entry, expiresAt: now + 120000 };
                }
                batches.set(intent.batchId, batch);
            }
            if (batch && (intent.goalReached || intent.milestoneCents !== null)) {
                const g = batch.tail, oldReward = g.reward, oldMilestone = g.milestone, oldTotal = g.campaignTotal;
                if (intent.goalReached) g.reward = 'goal'; else if (!g.reward) g.reward = 'milestone';
                g.milestone = Math.max(g.milestone || 0, intent.milestoneCents || 0) || null;
                g.campaignTotal = Math.max(g.campaignTotal || 0, intent.campaignTotalCents);
                const changed = oldReward !== g.reward || oldMilestone !== g.milestone || oldTotal !== g.campaignTotal;
                if (g === active && g.phase === 'party' && changed) {
                    if (g.reward === 'goal' && !g.goalShown) { g.goalShown = true; g.until = Math.min(now + 20000, g.partyStartedAt + 38000); }
                    if (!paused) messages.push(message(g));
                } else if (g.phase === 'completed' && !g.rewardShown && !late.includes(g)) {
                    late.push(g);
                } else if (g.phase === 'completed' && g.reward === 'goal' && !g.goalShown) {
                    // A completed party may resume only within its original bound, without interrupting newer work.
                    g.goalShown = true;
                    const until = Math.min(now + 20000, g.partyStartedAt + 38000);
                    if (!active && !paused && until > now) {
                        active = g; g.phase = 'party'; g.until = until; g.replay = false; messages.push(message(g));
                    }
                }
            }
            messages.push(...advance());
            return messages;
        } catch (error) { ({ active, queue, late, batches, known } = previous); throw error; }
    }
    return {
        accept, advance,
        nextTransitionAt() { return paused ? null : active?.until ?? null; },
        pause() {
            if (paused || stopped) return;
            if (active?.phase === 'party') active.remaining = Math.max(1, active.until - clock.nowMs());
            paused = true;
        },
        resume() {
            if (!paused || stopped) return [];
            paused = false;
            if (!active) return advance();
            const now = clock.nowMs(); active.replay = true;
            if (active.phase === 'recognition') { active.startedAt = now; active.until = now + 15000; }
            else { active.partyStartedAt = now; active.until = now + active.remaining; }
            return [message(active)];
        },
        clear() { active = null; queue = []; late = []; batches.clear(); known.clear(); },
        stop() { stopped = true; this.clear(); }
    };
}
module.exports = { createCampaignCelebrationComposer };
