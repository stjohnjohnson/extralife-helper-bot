const { randomUUID } = require('node:crypto');
const { validateCampaignServerMessage: validateServerMessage } = require('./protocol');
function createEventDispatcher({ realClock, send, newEventId = randomUUID }) {
    let active = true;
    const seen = new Set();
    return {
        publishHearts({ mode, generation, campaignId }) {
            if (!active) return false;
            const id = newEventId(); const key = mode + ':' + generation + ':' + id;
            if (seen.has(key)) return false;
            const issuedAtMs = realClock.nowMs();
            const message = validateServerMessage({ version: 3, type: 'hearts', mode, generation, campaignId, id, issuedAtMs, expiresAtMs: issuedAtMs + 10000, durationMs: 5000 });
            if (!send(message)) return false;
            seen.add(key); if (seen.size > 256) seen.delete(seen.values().next().value);
            return true;
        },
        publishGameEntrance({ mode, generation, campaignId, gameIdentity, themeId }) {
            if (!active) return false;
            const issuedAtMs = realClock.nowMs();
            return send(validateServerMessage({ version: 3, type: 'game-entrance', mode, generation, campaignId, gameIdentity, themeId,
                id: newEventId(), issuedAtMs, expiresAtMs: issuedAtMs + 10000, durationMs: 6000 }));
        },
        publishCelebration(message) {
            if (!active) return false;
            const issuedAtMs = realClock.nowMs();
            const packet = validateServerMessage({ ...message, version: 3, type: 'celebration', id: newEventId(), issuedAtMs, expiresAtMs: issuedAtMs + 10000 });
            return send(packet);
        },
        clear({ mode, generation }) { if (active) send(validateServerMessage({ version: 3, type: 'clear', mode, generation })); },
        stop() { active = false; seen.clear(); }
    };
}
module.exports = { createEventDispatcher };
