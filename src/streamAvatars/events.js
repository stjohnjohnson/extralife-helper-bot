const { randomUUID } = require('node:crypto');
const { validateServerMessage } = require('./protocol');
function createEventDispatcher({ realClock, send, newEventId = randomUUID }) {
    let active = true;
    const seen = new Set();
    return {
        publishHearts({ mode, generation, sessionId }) {
            if (!active) return false;
            const id = newEventId(); const key = mode + ':' + generation + ':' + id;
            if (seen.has(key)) return false;
            const issuedAtMs = realClock.nowMs();
            const message = validateServerMessage({ version: 2, type: 'hearts', mode, generation, sessionId, id, issuedAtMs, expiresAtMs: issuedAtMs + 10000, durationMs: 5000 });
            if (!send(message)) return false;
            seen.add(key); if (seen.size > 256) seen.delete(seen.values().next().value);
            return true;
        },
        publishCelebration(message) {
            if (!active) return false;
            const packet = validateServerMessage({ ...message, version: 2, type: 'celebration', id: newEventId() });
            return send(packet);
        },
        clear({ mode, generation }) { if (active) send(validateServerMessage({ version: 2, type: 'clear', mode, generation })); },
        stop() { active = false; seen.clear(); }
    };
}
module.exports = { createEventDispatcher };
