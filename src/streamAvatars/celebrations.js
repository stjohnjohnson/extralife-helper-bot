const { addCents } = require('../donations/money');
function createCelebrationComposer({ clock, random = Math.random }) {
    let sessionId = null, heartsUntilMs = 0, recognitionStartedAt = null;
    let donationCount = 0, donationTotalCents = 0, recognitionAction = null;
    const clearRecognition = () => { heartsUntilMs = 0; recognitionStartedAt = null; donationCount = 0; donationTotalCents = 0; recognitionAction = null; };
    let partyUntilMs = 0, partyStartedAt = null, kind = 'donation', liveTotalCents = 0, milestoneCents = null, stopped = false;
    const clear = () => { sessionId = null; clearRecognition(); partyUntilMs = 0; partyStartedAt = null; kind = 'donation'; milestoneCents = null; liveTotalCents = 0; };
    return {
        accept(intent) {
            if (stopped) return null;
            const now = clock.nowMs();
            if (intent.sessionId !== sessionId) { clear(); sessionId = intent.sessionId; }
            if (heartsUntilMs <= now) clearRecognition();
            if (partyUntilMs <= now) { partyUntilMs = 0; partyStartedAt = null; kind = 'donation'; milestoneCents = null; }
            liveTotalCents = Math.max(liveTotalCents, intent.liveTotalCents);
            if (intent.donationIds.length) {
                if (intent.donationCount !== intent.donationIds.length) throw new Error('Invalid donation recognition count');
                const count = addCents(donationCount, intent.donationCount);
                const total = donationTotalCents === null || intent.donationTotalCents === null ? null : addCents(donationTotalCents, intent.donationTotalCents);
                if (recognitionStartedAt === null) {
                    const draw = random();
                    if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error('Invalid recognition randomness');
                    recognitionAction = draw < 0.5 ? 'jump' : 'hug';
                    recognitionStartedAt = now;
                }
                donationCount = count; donationTotalCents = total;
                heartsUntilMs = Math.min(now + 5000, recognitionStartedAt + 10000);
            }
            if (intent.goalReached || intent.milestoneCents !== null) {
                if (partyStartedAt === null) { partyStartedAt = now; partyUntilMs = now + (intent.goalReached ? 20000 : 18000); }
                if (intent.goalReached && kind !== 'goal') partyUntilMs = Math.min(now + 20000, partyStartedAt + 38000);
                if (intent.goalReached) kind = 'goal';
                else if (kind !== 'goal') kind = 'milestone';
                if (intent.milestoneCents !== null) milestoneCents = Math.max(milestoneCents || 0, intent.milestoneCents);
            }
            return { sessionId, issuedAtMs: now, expiresAtMs: now + 10000, heartsUntilMs, partyUntilMs, kind, liveTotalCents, milestoneCents, donationCount, donationTotalCents, recognitionStartedAtMs: recognitionStartedAt, recognitionAction };
        },
        clear,
        stop() { stopped = true; clear(); }
    };
}
module.exports = { createCelebrationComposer };

function createCampaignCelebrationComposer({ clock, random = Math.random, newSequenceId = require('node:crypto').randomUUID }) {
    let active = null, pending = null, batches = new Map(), stopped = false;
    const safe = n => Number.isSafeInteger(n) && n >= 0;
    const id = s => typeof s === 'string' && s.length > 0 && s.length <= 128;
    const group = () => ({ sequenceId: newSequenceId(), giftIds: new Set(), count: 0, amount: 0, campaignTotal: null, milestone: null, reward: null,
        phase: 'pending', thanked: false, rewardShown: false, goalShown: false, startedAt: null, heartsUntil: 0, partyStartedAt: null, partyUntil: 0, action: null });
    const message = g => ({ sequenceId: g.sequenceId, phase: g.phase, kind: g.phase === 'recognition' ? 'donation' : g.reward,
        campaignTotalCents: g.campaignTotal, milestoneCents: g.phase === 'party' ? g.milestone : null,
        donationCount: g.phase === 'recognition' ? g.count : 0, donationTotalCents: g.phase === 'recognition' ? g.amount : 0,
        recognitionStartedAtMs: g.phase === 'recognition' ? g.startedAt : null, recognitionAction: g.phase === 'recognition' ? g.action : null,
        heartsUntilMs: g.phase === 'recognition' ? g.heartsUntil : 0, partyStartedAtMs: g.phase === 'party' ? g.partyStartedAt : null,
        partyUntilMs: g.phase === 'party' ? g.partyUntil : 0 });
    const hasReward = g => g.reward === 'goal' ? !g.goalShown : g.reward === 'milestone' && !g.rewardShown;
    function recognize(g, now) {
        const draw = random();
        if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error('Invalid recognition randomness');
        g.action = draw < 0.5 ? 'jump' : 'hug'; g.phase = 'recognition'; g.startedAt = now; g.heartsUntil = now + 5000;
        return message(g);
    }
    function party(g, now) {
        g.phase = 'party'; g.partyStartedAt = now; g.partyUntil = now + (g.reward === 'goal' ? 20000 : 18000);
        g.rewardShown = true; g.goalShown ||= g.reward === 'goal';
        return message(g);
    }
    function advance() {
        if (stopped) return [];
        const now = clock.nowMs(), messages = [];
        for (const [key, entry] of batches) if (entry.expiresAt < now) batches.delete(key);
        const alive = g => [...batches.values()].some(entry => entry.group === g);
        if (active && !alive(active)) active = null;
        if (pending && !alive(pending)) pending = null;
        if (active?.phase === 'recognition' && active.heartsUntil <= now) {
            active.thanked = true;
            if (hasReward(active)) messages.push(party(active, now));
            else { active.phase = 'completed'; active = null; }
        } else if (active?.phase === 'party' && active.partyUntil <= now) { active.phase = 'completed'; active = null; }
        if (!active && pending) {
            active = pending; pending = null;
            if (active.count && !active.thanked) messages.push(recognize(active, now));
            else if (hasReward(active)) messages.push(party(active, now));
            else active = null;
        }
        return messages;
    }
    function foldReward(target, source) {
        if (source.reward === 'goal') target.reward = 'goal';
        else if (!target.reward) target.reward = source.reward;
        target.milestone = Math.max(target.milestone || 0, source.milestone || 0) || null;
        if (source.campaignTotal !== null) target.campaignTotal = Math.max(target.campaignTotal || 0, source.campaignTotal);
        for (const giftId of source.giftIds) target.giftIds.add(giftId);
        for (const entry of batches.values()) if (entry.group === source) entry.group = target;
    }
    return {
        accept(intent) {
            if (stopped) return [];
            if (!id(intent.batchId) || !Array.isArray(intent.donationIds) || !intent.donationIds.every(id) || new Set(intent.donationIds).size !== intent.donationIds.length ||
                !safe(intent.donationCount) || intent.donationCount !== intent.donationIds.length || !(intent.donationTotalCents === null || safe(intent.donationTotalCents)) ||
                (!intent.donationCount && intent.donationTotalCents !== 0) || !(intent.campaignTotalCents === null || safe(intent.campaignTotalCents)) ||
                !(intent.milestoneCents === null || (safe(intent.milestoneCents) && intent.milestoneCents > 0 && intent.campaignTotalCents !== null && intent.milestoneCents <= intent.campaignTotalCents)) ||
                typeof intent.goalReached !== 'boolean') throw new Error('Invalid campaign celebration intent');
            // Validate/aggregate transactionally: overflow or invalid randomness
            // cannot partly consume IDs, shorten a phase or corrupt queued money.
            const previous = structuredClone({ active, pending, batches });
            try {
                const now = clock.nowMs(), messages = advance();
                let g = batches.get(intent.batchId)?.group;
                const known = new Set([...batches.values()].flatMap(e => [...e.group.giftIds]));
                const fresh = intent.donationIds.filter(giftId => !known.has(giftId));
                if (fresh.length && fresh.length !== intent.donationCount) throw new Error('Partially duplicated campaign intent');
                let recognitionChanged = false;
                if (fresh.length) {
                    if (active?.phase === 'recognition') g = active;
                    else if (active?.phase === 'party') { pending ??= group(); g = pending; }
                    else { active = group(); g = active; }
                    g.count = addCents(g.count, intent.donationCount);
                    g.amount = g.amount === null || intent.donationTotalCents === null ? null : addCents(g.amount, intent.donationTotalCents);
                    if (intent.campaignTotalCents !== null) g.campaignTotal = Math.max(g.campaignTotal || 0, intent.campaignTotalCents);
                    for (const giftId of fresh) g.giftIds.add(giftId);
                    batches.set(intent.batchId, { group: g, expiresAt: now + 120000 });
                    if (g === active) {
                        if (g.phase !== 'recognition') messages.push(recognize(g, now));
                        else { g.heartsUntil = Math.min(now + 5000, g.startedAt + 10000); recognitionChanged = true; }
                    }
                }
                if (g && (intent.goalReached || intent.milestoneCents !== null)) {
                    const oldReward = g.reward, oldMilestone = g.milestone, oldTotal = g.campaignTotal;
                    if (intent.goalReached) g.reward = 'goal'; else if (!g.reward) g.reward = 'milestone';
                    g.milestone = Math.max(g.milestone || 0, intent.milestoneCents || 0) || null;
                    g.campaignTotal = Math.max(g.campaignTotal || 0, intent.campaignTotalCents);
                    const changed = oldReward !== g.reward || oldMilestone !== g.milestone || oldTotal !== g.campaignTotal;
                    if (g === active && g.phase === 'party' && changed) {
                        if (g.reward === 'goal' && !g.goalShown) { g.goalShown = true; g.partyUntil = Math.min(now + 20000, g.partyStartedAt + 38000); }
                        messages.push(message(g));
                    } else if (g === active && g.phase === 'recognition' && changed) recognitionChanged = !messages.length;
                    else if (g !== active && g !== pending && hasReward(g)) {
                        if (active?.phase === 'recognition') foldReward(active, g);
                        else if (active?.phase === 'party') { pending ??= group(); foldReward(pending, g); }
                        else { active = g; messages.push(party(g, now)); }
                    }
                }
                if (recognitionChanged) messages.push(message(active));
                return messages;
            } catch (error) { ({ active, pending, batches } = previous); throw error; }
        },
        advance,
        nextTransitionAt() { return active?.phase === 'recognition' ? active.heartsUntil : active?.phase === 'party' ? active.partyUntil : null; },
        clear() { active = null; pending = null; batches.clear(); },
        stop() { stopped = true; active = null; pending = null; batches.clear(); }
    };
}
module.exports.createCampaignCelebrationComposer = createCampaignCelebrationComposer;
