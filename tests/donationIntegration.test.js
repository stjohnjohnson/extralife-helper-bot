const fs = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { once, on } = require('node:events');
const WebSocket = require('ws');
const { startStreamAvatars } = require('../src/streamAvatars');
let directory, service, socket, now;
const config = () => ({ participantId: '123', webServer: { host: '127.0.0.1', port: 0 }, streamAvatars: { config: { token: 't'.repeat(32), stateDir: directory, donationIntervalCents: 50000 } } });
async function start() { service = await startStreamAvatars({ config: config(), realClock: { nowMs: () => now } }); }
beforeEach(async () => { now = 10000000; directory = await fs.mkdtemp(join(tmpdir(), 'sa-donations-')); await start(); });
afterEach(async () => { socket?.terminate(); socket = null; await service.stop(); await fs.rm(directory, { recursive: true, force: true }); });
const gift = (id, amountCents) => ({ id, participantId: '123', createdAtMs: now, amountCents });
const campaign = (totalCents = 49000, goalCents = 100000) => ({ observedAtMs: now, totalCents, goalCents });
async function accept(donations, total) { return service.acceptObservation({ expectedEpochId: service.getPollCheckpoint().epochId, batchId: 'batch', donations, complete: true, campaign: total, observedAtMs: now }); }
async function connect() {
    socket = new WebSocket(`ws://127.0.0.1:${service.address.port}/sa/socket`); await once(socket, 'open');
    const received = once(socket, 'message'); socket.send(JSON.stringify({ version: 3, type: 'auth', token: 't'.repeat(32) })); const [raw] = await received;
    socket.send(JSON.stringify({ version: 3, type: 'ready', capabilities: ['campaign', 'celebrations', 'donation-recognition'], resolution: { width: 1920, height: 1080 } }));
    for (let i = 0; i < 30 && !service.getStatus().companionReady; i++) await new Promise(resolve => setTimeout(resolve, 2));
    expect(service.getStatus().companionReady).toBe(true); return JSON.parse(raw);
}
test.each([0, 50])('campaign accounting recognizes an authoritative milestone with %i ms delivery delay', async deliveryDelayMs => {
    expect((await accept([gift('seed', 49000)], campaign())).intent).toBeNull();
    await connect(); now++;
    const messages = on(socket, 'message', { signal: AbortSignal.timeout(2000) });
    let resumeTimer;
    try {
        socket.pause();
        const result = await accept([gift('seed', 49000), gift('live', 1000)], campaign(50000));
        expect(result).toMatchObject({ accepted: true, delivered: true, intent: { milestoneCents: 50000 } });
        resumeTimer = setTimeout(() => socket.resume(), deliveryDelayMs);
        for await (const [raw] of messages) {
            const message = JSON.parse(raw);
            if (message.type !== 'celebration') continue;
            expect(message).toMatchObject({ phase: 'recognition', donationTotalCents: 1000 });
            break;
        }
        expect(service.getStatus()).toMatchObject({ campaignTotalCents: 50000, nextMilestoneCents: 100000 });
    } finally {
        clearTimeout(resumeTimer);
        socket.resume();
        await messages.return();
    }
});
test('restart silently baselines 140 donations, then accepts a later gift once and rejects the old epoch', async () => {
    const donations = Array.from({ length: 140 }, (_, i) => gift('d' + i, 100));
    await accept(donations, campaign()); const epoch = service.getPollCheckpoint().epochId; await service.stop(); await start();
    expect((await accept(donations, campaign())).intent).toBeNull();
    now++; const updated = [...donations, gift('next', 2500)];
    expect((await accept(updated, campaign(51500))).intent).toMatchObject({ donationCount: 1, donationTotalCents: 2500 });
    expect((await accept(updated, campaign(51500))).intent).toBeNull();
    expect(await service.acceptObservation({ expectedEpochId: epoch, batchId: 'old', observedAtMs: now })).toMatchObject({ accepted: false });
});
test('fresh campaign observation can confirm a delayed goal without a duplicate donation', async () => {
    await accept([], campaign(90000)); await connect(); now++;
    const donations = [gift('goal', 10000)]; await accept(donations);
    now++; expect((await accept(donations, campaign(100000))).intent).toMatchObject({ goalReached: true, donationIds: [] });
    expect(service.getStatus().campaignTotalCents).toBe(100000);
});
test('donations received without a companion persist progress but never replay effects on reconnect', async () => {
    await accept([], campaign()); now++;
    expect((await accept([gift('offline', 1000)], campaign(50000))).delivered).toBe(false);
    const snapshot = await connect(); const packets = []; socket.on('message', raw => packets.push(JSON.parse(raw)));
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(snapshot.campaign.totalCents).toBe(50000); expect(packets.some(p => p.type === 'celebration')).toBe(false);
    now++; expect((await accept([gift('offline', 1000)], campaign(50000))).intent).toBeNull();
});
