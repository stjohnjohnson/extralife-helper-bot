const { setTimeout: delay } = require('node:timers/promises');
const { parseCents } = require('./money');
const API = 'https://www.extra-life.org/api/participants/';
// v1.0 has different offset conventions. Pin the documented zero-based contract.
const VERSION = '1.4';
function parseDonationTime(value) {
    if (typeof value !== 'string') throw new Error('Invalid donation timestamp');
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:?\d{2})$/.exec(value);
    if (!match) throw new Error('Ambiguous donation timestamp');
    const [, year, month, day, hour, minute, second, zone] = match;
    if (+month < 1 || +month > 12 || +day < 1 || +day > new Date(Date.UTC(+year, +month, 0)).getUTCDate() || +hour > 23 || +minute > 59 || +second > 59 || (zone !== 'Z' && (+zone.slice(1, 3) > 23 || +zone.slice(-2) > 59))) throw new Error('Invalid donation timestamp');
    const time = Date.parse(value);
    if (!Number.isSafeInteger(time) || time < 0) throw new Error('Invalid donation timestamp');
    return time;
}
function normalizeDonation(raw, participantId, throughMs) {
    if (!raw || typeof raw.donationID !== 'string' || !raw.donationID.trim() || raw.donationID.length > 128 ||
        (raw.participantID != null && String(raw.participantID) !== String(participantId)) || raw.isRegFee === true) throw new Error('Invalid donation identity');
    const createdAtMs = parseDonationTime(raw.createdDateUTC);
    if (createdAtMs > throughMs) throw new Error('Future donation timestamp');
    return { id: raw.donationID, participantId: String(participantId), createdAtMs, amountCents: parseCents(raw.amount) };
}
function createDonationSource({ fetch: fetcher = globalThis.fetch, clock = { nowMs: Date.now }, requestGapMs = 15000, logger = { warn() {} }, wait = delay } = {}) {
    const controller = new AbortController();
    let nextRequestAt = 0, tail = Promise.resolve(), campaign = null;
    function request(url, signal) {
        const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
        const operation = tail.then(async () => {
            combined.throwIfAborted();
            const remaining = nextRequestAt - clock.nowMs();
            if (remaining > 0) await wait(remaining, undefined, { signal: combined });
            combined.throwIfAborted();
            nextRequestAt = clock.nowMs() + requestGapMs;
            const response = await fetcher(url, { signal: AbortSignal.any([combined, AbortSignal.timeout(10000)]) });
            if (response.status === 429) {
                const retry = response.headers.get('retry-after');
                const seconds = Number(retry);
                const until = retry && !Number.isFinite(seconds) ? Date.parse(retry) : clock.nowMs() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000;
                nextRequestAt = Math.max(nextRequestAt, Number.isFinite(until) ? until : clock.nowMs() + 60000);
            }
            if (response.status !== 200 && response.status !== 204) throw new Error('Donation API status ' + response.status);
            const receivedVersion = response.headers.get('api-version');
            if (receivedVersion && receivedVersion !== VERSION) throw new Error('Unexpected donation API version');
            return response;
        });
        tail = operation.catch(() => {});
        return operation;
    }
    const endpoint = participantId => API + encodeURIComponent(String(participantId));
    return {
        async poll({ participantId, window = null, signal, onLatest = () => {} }) {
            const throughMs = window?.throughMs ?? clock.nowMs();
            const donations = [], ids = new Set();
            let expectedCount = null, previousTime = Infinity;
            for (let offset = 0; offset < 25600; offset += 100) {
                const url = new URL(endpoint(participantId) + '/donations');
                url.searchParams.set('version', VERSION); url.searchParams.set('limit', '100'); url.searchParams.set('offset', String(offset));
                url.searchParams.set('orderBy', 'createdDateUTC DESC, donationID DESC');
                url.searchParams.set('where', `createdDateUTC <= '${new Date(throughMs).toISOString()}'`);
                const res = await request(url.toString(), signal);
                const countHeader = res.headers.get('num-records');
                const count = countHeader === null ? null : Number(countHeader);
                if (count !== null && (!/^\d+$/.test(countHeader) || !Number.isSafeInteger(count) || (expectedCount !== null && count !== expectedCount))) throw new Error('Unstable donation pagination');
                if (count !== null) expectedCount = count;
                const records = res.status === 204 ? [] : await res.json();
                if (!Array.isArray(records) || records.length > 100 || (count !== null && offset + records.length > count)) throw new Error('Invalid donation page');
                if (offset === 0) await onLatest(records);
                let passedStart = false, newIds = 0;
                for (const raw of records) {
                    let timestamp;
                    try { timestamp = parseDonationTime(raw?.createdDateUTC); }
                    catch { logger.warn('Donation record excluded', { code: 'invalid-timestamp' }); continue; }
                    if (timestamp > previousTime || timestamp > throughMs) throw new Error('Unstable donation ordering');
                    previousTime = timestamp;
                    if (window && timestamp < window.fromMs) passedStart = true;
                    let item;
                    try { item = normalizeDonation(raw, participantId, throughMs); }
                    catch { logger.warn('Donation record excluded', { code: 'invalid-donation' }); continue; }
                    if (ids.has(item.id)) continue;
                    ids.add(item.id); newIds++;
                    if (window && timestamp >= window.fromMs) donations.push(item);
                }
                if (offset > 0 && records.length === 100 && newIds === 0) throw new Error('Repeated donation page');
                if (!window || passedStart || records.length < 100 || (count !== null && offset + records.length === count)) {
                    if (!passedStart && records.length < 100 && count !== null && offset + records.length < count) throw new Error('Incomplete donation page');
                    return { scan: window ? { participantId: String(participantId), fromMs: window.fromMs, throughMs, donations, complete: true } : null, campaign };
                }
            }
            throw new Error('Donation catch-up exceeds bounded page limit');
        },
        async readCampaign({ participantId, signal }) {
            const res = await request(endpoint(participantId) + '?version=' + VERSION, signal);
            if (res.status !== 200) throw new Error('Missing campaign observation');
            const data = await res.json();
            const totalCents = parseCents(data.sumDonations), goalCents = parseCents(data.fundraisingGoal);
            if (totalCents === null || goalCents === null || goalCents <= 0) throw new Error('Invalid campaign observation');
            campaign = { observedAtMs: clock.nowMs(), totalCents, goalCents };
            return campaign;
        },
        stop() { controller.abort(); }
    };
}
module.exports = { createDonationSource, normalizeDonation, parseDonationTime };
