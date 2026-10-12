// Shared Twitch sample validation; independent of fundraising progress.
function validObservation(value) {
    return value && ['online', 'offline', 'unknown'].includes(value.status) &&
        Number.isFinite(value.observedAtMs) && value.observedAtMs >= 0 &&
        (value.status !== 'online' || (typeof value.streamId === 'string' && value.streamId.length > 0 &&
            Number.isFinite(value.startedAtMs) && value.startedAtMs >= 0 && value.startedAtMs <= value.observedAtMs));
}
module.exports = { validObservation };
