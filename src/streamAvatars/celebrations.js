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
