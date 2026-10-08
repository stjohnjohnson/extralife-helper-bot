const {
    makeTwitchApiRequest, getValidAccessToken, getBroadcasterIdFromChannel
} = require('./gameUpdates');

const moneyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const OPERATION_TIMEOUT_MS = 10000;

function donationCents(amount) {
    if (typeof amount !== 'number' && typeof amount !== 'string') return null;
    const raw = String(amount);
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
    const cents = Math.round(Number(raw) * 100);
    return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function markerDescription(cents, displayName) {
    const prefix = `Donation: ${moneyFormatter.format(cents / 100)} from `;
    const name = typeof displayName === 'string' && displayName.trim() ? displayName : 'Anonymous';
    const available = 140 - prefix.length;
    if (name.length <= available) return prefix + name;
    // Count UTF-16 units conservatively and never cut an astral character in half.
    let shortened = '';
    for (const character of name) {
        if (shortened.length + character.length > available - 1) break;
        shortened += character;
    }
    return prefix + shortened + '…';
}

/** One runtime service; only newly announced donations should be submitted. */
function createStreamMarkerService(config, logger) {
    const threshold = config.streamMarkers?.donationThresholdCents;
    const pending = new Set();
    let active = true;
    let broadcasterId;
    let preparing;
    let preparationController;

    async function credentials() {
        if (!preparing) {
            preparationController = new AbortController();
            const signal = preparationController.signal;
            preparing = (async () => {
                const accessToken = await getValidAccessToken(config, logger, signal);
                if (!active || signal.aborted || pending.size === 0) return null;
                if (!broadcasterId) {
                    broadcasterId = await getBroadcasterIdFromChannel(
                        config.twitch.channel, config.twitch.clientId, accessToken, signal
                    );
                }
                return { accessToken, broadcasterId };
            })().finally(() => { preparing = null; preparationController = null; });
        }
        return preparing;
    }

    async function markDonation(donation) {
        const cents = donationCents(donation.amount);
        if (!active || !Number.isSafeInteger(threshold) || threshold <= 0 || cents === null || cents < threshold) return null;
        const controller = new AbortController();
        pending.add(controller);
        let timedOut = false;
        const timeout = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, OPERATION_TIMEOUT_MS);
        const cancelled = new Promise(resolve => controller.signal.addEventListener('abort', () => resolve(null), { once: true }));
        const operation = (async () => {
            const auth = await credentials();
            if (!auth || !active || controller.signal.aborted) return null;
            const response = await makeTwitchApiRequest('/streams/markers', {
                method: 'POST', signal: controller.signal,
                body: { user_id: auth.broadcasterId, description: markerDescription(cents, donation.displayName) }
            }, config.twitch.clientId, auth.accessToken);
            if (!active || controller.signal.aborted) return null;
            const marker = response?.data?.[0];
            if (!marker?.id || !Number.isInteger(marker.position_seconds)) throw new Error('Invalid marker response');
            logger.info('Created donation stream marker', {
                donationId: donation.donationID, markerId: marker.id,
                positionSeconds: marker.position_seconds, createdAt: marker.created_at
            });
            return marker;
        })().catch(error => {
            if (!active || controller.signal.aborted) return null;
            // Avoid logging raw response/error text, which may contain credentials.
            const message = error.statusCode === 404 ?
                'Skipped donation stream marker: stream offline or VOD unavailable' : 'Donation stream marker failed';
            logger.warn(message, { donationId: donation.donationID, statusCode: error.statusCode ?? null });
            return null;
        });
        try {
            const result = await Promise.race([operation, cancelled]);
            if (active && timedOut) logger.warn('Donation stream marker timed out', { donationId: donation.donationID });
            return result;
        } finally {
            clearTimeout(timeout);
            pending.delete(controller);
            if (pending.size === 0) preparationController?.abort();
        }
    }

    function stop() {
        active = false;
        preparationController?.abort();
        pending.forEach(controller => controller.abort());
    }

    return { markDonation, stop };
}

module.exports = { createStreamMarkerService };
