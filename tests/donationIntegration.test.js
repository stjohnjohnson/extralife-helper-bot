const fs = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { once } = require('node:events');
const WebSocket = require('ws');
const { startStreamAvatars } = require('../src/streamAvatars');
let directory, service, socket, now;
beforeEach(async () => {
    now = 10000000; directory = await fs.mkdtemp(join(tmpdir(), 'sa-donations-'));
    service = await startStreamAvatars({ config: { participantId: '123', twitch: { channel: 'streamer' }, webServer: { host: '127.0.0.1', port: 0 }, streamAvatars: { config: { token: 't'.repeat(32), stateDir: directory, graceMs: 900000, donationIntervalCents: 50000 } } }, logger: { warn() {} }, realClock: { nowMs: () => now } });
});
afterEach(async () => { socket?.terminate(); socket = null; await service.stop(); await fs.rm(directory, { recursive: true, force: true }); });
const scan = donations => ({ complete: true, participantId: '123', fromMs: 9000000, throughMs: now, donations });
const gift = (id, amountCents) => ({ id, participantId: '123', createdAtMs: 9000001, amountCents });
async function live() { await service.observeProduction({ status: 'online', observedAtMs: now, startedAtMs: 9000000, streamId: 'real' }); }
async function accept(donations, campaign) { return service.acceptDonations({ expectedSessionId: service.getStatus().state.sessionId, scan: scan(donations), campaign, observedAtMs: now }); }
async function connect() {
    socket = new WebSocket(`ws://127.0.0.1:${service.address.port}/sa/socket`); await once(socket, 'open');
    const received = once(socket, 'message'); socket.send(JSON.stringify({ version: 2, type: 'auth', token: 't'.repeat(32) })); await received;
    socket.send(JSON.stringify({ version: 2, type: 'ready', capabilities: ['celebrations'], resolution: { width: 1920, height: 1080 } }));
    for (let i = 0; i < 30 && !service.getStatus().companionReady; i++) await new Promise(resolve => setTimeout(resolve, 2));
}
test('accounting waits for a window, reconciles without a companion, then recognizes donations in offline grace', async () => {
    expect(service.getSessionWindow()).toBeNull(); await live();
    expect(service.getSessionWindow()).toMatchObject({ participantId: '123', fromMs: 9000000, throughMs: now });
    expect((await accept([gift('seed', 49000)])).intent).toBeNull();
    await connect(); now++; await service.observeProduction({ status: 'offline', observedAtMs: now });
    const received = [];
    socket.on('message', raw => received.push(JSON.parse(raw)));
    const result = await accept([gift('seed', 49000), gift('live', 1000)]);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(result).toMatchObject({ accepted: true, delivered: true, intent: { milestoneCents: 50000 } });
    expect(received.find(message => message.type === 'celebration')).toMatchObject({ kind: 'milestone', liveTotalCents: 50000, partyUntilMs: now + 18000 });
    expect(service.getStatus()).toMatchObject({ knownLiveTotalCents: 50000, reconciliationRequired: false });
});
test('restart silently reconciles 140 donations and accepts a later gift once; stale session is rejected', async () => {
    await live(); const donations = Array.from({ length: 140 }, (_, i) => gift('d' + i, 100));
    await accept(donations); await service.stop();
    service = await startStreamAvatars({ config: { participantId: '123', twitch: { channel: 'streamer' }, webServer: { host: '127.0.0.1', port: 0 }, streamAvatars: { config: { token: 't'.repeat(32), stateDir: directory, graceMs: 900000 } } }, logger: { warn() {} }, realClock: { nowMs: () => now } });
    expect((await accept(donations)).intent).toBeNull();
    now++; const updated = [...donations, gift('next', 2500)];
    expect((await accept(updated)).intent).toMatchObject({ liveTotalCents: 16500 });
    expect((await accept(updated)).intent).toBeNull();
    expect(await service.acceptDonations({ expectedSessionId: 'old', scan: scan(updated) })).toMatchObject({ accepted: false });
});
test('newer campaign observation can confirm a delayed goal with no duplicate donation', async () => {
    await live(); await accept([], { observedAtMs: now, totalCents: 90000, goalCents: 100000 });
    now++; const donations = [gift('goal', 10000)]; await accept(donations);
    now++; expect((await accept(donations, { observedAtMs: now, totalCents: 100000, goalCents: 100000 })).intent).toMatchObject({ goalReached: true, donationIds: [] });
    expect(service.getStatus().state.liveTotalCents).toBe(10000);
});
