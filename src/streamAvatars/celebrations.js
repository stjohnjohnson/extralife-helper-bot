function createCelebrationComposer({ clock }) {
    let sessionId = null, heartsUntilMs = 0, recognitionStartedAt = null;
    let partyUntilMs = 0, partyStartedAt = null, kind = 'donation', liveTotalCents = 0, milestoneCents = null, stopped = false;
    const clear = () => { sessionId = null; heartsUntilMs = 0; recognitionStartedAt = null; partyUntilMs = 0; partyStartedAt = null; kind = 'donation'; milestoneCents = null; liveTotalCents = 0; };
    return {
        accept(intent) {
            if (stopped) return null;
            const now = clock.nowMs();
            if (intent.sessionId !== sessionId) { clear(); sessionId = intent.sessionId; }
            if (heartsUntilMs <= now) { heartsUntilMs = 0; recognitionStartedAt = null; }
            if (partyUntilMs <= now) { partyUntilMs = 0; partyStartedAt = null; kind = 'donation'; milestoneCents = null; }
            liveTotalCents = Math.max(liveTotalCents, intent.liveTotalCents);
            if (intent.donationIds.length) {
                recognitionStartedAt ??= now;
                heartsUntilMs = Math.min(now + 5000, recognitionStartedAt + 10000);
            }
            if (intent.goalReached || intent.milestoneCents !== null) {
                if (partyStartedAt === null) { partyStartedAt = now; partyUntilMs = now + (intent.goalReached ? 20000 : 18000); }
                if (intent.goalReached && kind !== 'goal') partyUntilMs = Math.min(now + 20000, partyStartedAt + 38000);
                if (intent.goalReached) kind = 'goal';
                else if (kind !== 'goal') kind = 'milestone';
                if (intent.milestoneCents !== null) milestoneCents = Math.max(milestoneCents || 0, intent.milestoneCents);
            }
            return { sessionId, issuedAtMs: now, expiresAtMs: now + 10000, heartsUntilMs, partyUntilMs, kind, liveTotalCents, milestoneCents };
        },
        clear,
        stop() { stopped = true; clear(); }
    };
}
module.exports = { createCelebrationComposer };
