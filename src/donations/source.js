const { setTimeout: delay } = require('node:timers/promises');
const { parseCents } = require('./money');
const { participantEndpoint } = require('../extralife');
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
    let nextRequestAt = 0, tail = Promise.resolve();
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
    return {
        async poll({ participantId, signal, onLatest = () => {}, announcementCheckpoint, onAnnouncements }) {
            await this.pollCampaignDonations({ participantId, signal, onLatest, announcementCheckpoint, onAnnouncements,
                checkpoint: { participantId: String(participantId), rawSeenDonationIds: [], baselineAtMs: null, baselineNeeded: true, recordCount: null } });
            return { scan: null };
        },
        async pollCampaignDonations({ participantId, checkpoint, signal, onLatest = () => {}, onDonations = () => {}, announcementCheckpoint, onAnnouncements = () => {}, onCampaignComplete = () => {} }) {
            if (!checkpoint || String(checkpoint.participantId) !== String(participantId) || !Array.isArray(checkpoint.rawSeenDonationIds) ||
                !(checkpoint.baselineAtMs === null || (Number.isSafeInteger(checkpoint.baselineAtMs) && checkpoint.baselineAtMs >= 0))) throw new Error('Invalid donation checkpoint');
            const throughMs = clock.nowMs(), seen = new Set(checkpoint.rawSeenDonationIds), census = new Set(), facts = new Map(), donations = [];
            const replayEnabled = announcementCheckpoint !== undefined, announcementRows = [];
            let announcementDone = !replayEnabled, announcementFound = false, campaignResult = null;
            let expectedCount = null, previousTime = Infinity, previousId = null, discovered = 0;
            for (let offset = 0; offset < 25600; offset += 100) {
                const url = new URL(participantEndpoint(participantId) + '/donations');
                url.searchParams.set('version', VERSION); url.searchParams.set('limit', '100'); url.searchParams.set('offset', String(offset));
                url.searchParams.set('orderBy', 'createdDateUTC DESC, donationID DESC');
                url.searchParams.set('where', `createdDateUTC <= '${new Date(throughMs).toISOString()}'`);
                const res = await request(url.toString(), signal);
                const header = res.headers.get('num-records'), count = header === null ? null : Number(header);
                if (count !== null && (!/^\d+$/.test(header) || !Number.isSafeInteger(count) || (expectedCount !== null && count !== expectedCount))) throw new Error('Unstable donation pagination');
                if (count !== null) expectedCount = count;
                const records = res.status === 204 ? [] : await res.json();
                if (!Array.isArray(records) || records.length > 100 || (count !== null && offset + records.length > count)) throw new Error('Invalid donation page');
                if (offset === 0) await onLatest(records);
                let passedBaseline = false, uniqueRows = 0;
                const page = [];
                for (const raw of records) {
                    const rawId = raw?.donationID;
                    const validId = typeof rawId === 'string' && rawId.trim() && rawId.length <= 128;
                    if (replayEnabled && (!validId || (raw.participantID != null && String(raw.participantID) !== String(participantId)))) throw new Error('Invalid announcement donation identity');
                    const unseen = validId && !census.has(rawId);
                    if (unseen) { census.add(rawId); uniqueRows++; }
                    let timestamp;
                    try { timestamp = parseDonationTime(raw?.createdDateUTC); }
                    catch (error) { if (replayEnabled) throw error; logger.warn('Donation record excluded', { code: 'invalid-timestamp' }); continue; }
                    if (timestamp > previousTime || timestamp > throughMs || (replayEnabled && timestamp === previousTime && rawId > previousId)) throw new Error('Unstable donation ordering');
                    previousTime = timestamp; previousId = rawId;
                    if (!announcementDone && !announcementFound) {
                        if (rawId === announcementCheckpoint?.lastDonationId) announcementFound = true;
                        else if (unseen) announcementRows.push(raw);
                    }
                    const inBaseline = checkpoint.baselineAtMs === null || timestamp >= checkpoint.baselineAtMs;
                    if (!inBaseline) passedBaseline = true;
                    if (unseen && !seen.has(rawId) && inBaseline) discovered++;
                    let item;
                    try { item = normalizeDonation(raw, participantId, throughMs); }
                    catch { logger.warn('Donation record excluded', { code: 'invalid-donation' }); continue; }
                    const previous = facts.get(item.id);
                    if (previous && (previous.amountCents !== item.amountCents || previous.createdAtMs !== item.createdAtMs)) logger.warn('Donation record excluded', { code: 'conflicting-donation' });
                    else if (!previous) facts.set(item.id, item);
                    if (!campaignResult && unseen && (checkpoint.baselineNeeded || inBaseline)) page.push(item);
                }
                if (offset > 0 && records.length === 100 && uniqueRows === 0) throw new Error('Repeated donation page');
                if (!campaignResult) {
                    donations.push(...page);
                    await onDonations({ donations: page, throughMs, complete: false });
                }
                const explained = count !== null && checkpoint.recordCount !== null && discovered >= Math.max(0, count - checkpoint.recordCount);
                const atEnd = records.length < 100 || (count !== null && offset + records.length === count);
                if (replayEnabled && records.length < 100 && count !== null && offset + records.length < count) throw new Error('Incomplete donation page');
                if (!campaignResult && (checkpoint.baselineNeeded || passedBaseline || atEnd || explained)) {
                    if (records.length < 100 && count !== null && offset + records.length < count && !passedBaseline && !checkpoint.baselineNeeded && !explained) throw new Error('Incomplete donation page');
                    campaignResult = { complete: true, throughMs, recordCount: count, rawSeenIds: [...census], donations };
                    await onCampaignComplete(campaignResult);
                }
                if (!announcementDone && (announcementCheckpoint === null || announcementFound || (announcementCheckpoint.lastDonationId === null && atEnd))) {
                    await onAnnouncements({ donations: announcementRows, baseline: announcementCheckpoint === null });
                    announcementDone = true;
                }
                if (!announcementDone && atEnd) throw new Error('Saved donation checkpoint was not found; restore the checkpoint before retrying');
                if (campaignResult && announcementDone) return campaignResult;
            }
            throw new Error('Donation catch-up exceeds bounded page limit');
        },
        async readCampaign({ participantId, signal }) {
            const res = await request(participantEndpoint(participantId) + '?version=' + VERSION, signal);
            if (res.status !== 200) throw new Error('Missing campaign observation');
            const data = await res.json();
            const totalCents = parseCents(data.sumDonations), goalCents = parseCents(data.fundraisingGoal);
            if (totalCents === null || goalCents === null || goalCents <= 0) throw new Error('Invalid campaign observation');
            return { observedAtMs: clock.nowMs(), totalCents, goalCents };
        },
        stop() { controller.abort(); }
    };
}
module.exports = { createDonationSource, normalizeDonation, parseDonationTime };
