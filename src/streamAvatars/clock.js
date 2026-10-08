function createVirtualClock({ nowMs }) {
    let time = nowMs;
    const listeners = new Set();
    const seek = value => {
        if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid virtual time');
        time = value; for (const listener of listeners) listener(time); return time;
    };
    return { nowMs: () => time, seek,
        advance(ms) { if (!Number.isSafeInteger(ms) || ms < 0) throw new Error('Invalid virtual duration'); return seek(time + ms); },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
}
module.exports = { createVirtualClock };
