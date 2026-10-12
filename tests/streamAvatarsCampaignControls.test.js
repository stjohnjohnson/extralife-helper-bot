const fs = require('node:fs/promises');
const { tmpdir } = require('node:os'); const { join } = require('node:path');
const { startStreamAvatars } = require('../src/streamAvatars');
const { parseAction } = require('../src/streamAvatars/actions');
let directory, service, now;
beforeEach(async () => { directory = await fs.mkdtemp(join(tmpdir(), 'sa-controls-')); now = 10000000; });
afterEach(async () => { await service?.stop(); service = null; await fs.rm(directory, { recursive: true, force: true }); });
async function start() {
    service = await startStreamAvatars({ config: { participantId: '12', webServer: { host: '127.0.0.1', port: 0 }, streamAvatars: { config: { token: 'a'.repeat(32), stateDir: directory } } }, realClock: { nowMs: () => now } });
}
const command = text => service.dispatch(parseAction(text));
test.each(['clock advance 1h', 'clock seek 5m', 'scenario reconnect', 'hue on', 'hue off', 'rehearsal reset', 'crowd join 1', 'crowd leave 1', 'crowd -1', 'crowd 101', 'hearts extra', 'rehearsal start extra', 'session reset confirm', 'campaign reset', 'campaign recover'])('unsupported or unconfirmed control is rejected: %s', input => {
    expect(() => parseAction(input)).toThrow(/Use|Invalid/);
});
test('ordinary campaign samples do not clear an ongoing effect', async () => {
    const WebSocket = require('ws'); const { once } = require('node:events');
    await start(); const socket = new WebSocket(`ws://127.0.0.1:${service.address.port}/sa/socket`); await once(socket, 'open');
    const received = []; socket.on('message', raw => received.push(JSON.parse(raw)));
    const accept = totalCents => service.acceptObservation({ expectedEpochId: service.getPollCheckpoint().epochId, batchId: 'batch', observedAtMs: now, campaign: { observedAtMs: now, totalCents, goalCents: 100000 } });
    try {
        const wait = once(socket, 'message'); socket.send(JSON.stringify({ version: 3, type: 'auth', token: 'a'.repeat(32) })); await wait;
        await accept(90000); received.length = 0; now++; await accept(90001);
        await new Promise(resolve => setTimeout(resolve, 5));
        expect(received.some(message => message.type === 'clear')).toBe(false);
    } finally { socket.terminate(); }
});
test('confirmed campaign reset and recovery need no broadcast observation and silently rebaseline', async () => {
    await start();
    for (const totalCents of [90000, 90001]) { now++; await service.acceptObservation({ expectedEpochId: service.getPollCheckpoint().epochId, batchId: 'seed', observedAtMs: now, campaign: { observedAtMs: now, totalCents, goalCents: 100000 } }); }
    const old = service.getPollCheckpoint().epochId;
    expect((await command('campaign reset confirm')).status).toBe('ok');
    expect(service.getPollCheckpoint()).toMatchObject({ baselineNeeded: true }); expect(service.getPollCheckpoint().epochId).not.toBe(old);
    expect((await command('campaign recover confirm')).status).toBe('ok');
    expect(service.getPollCheckpoint().baselineNeeded).toBe(true);
    now++;
    const result = await service.acceptObservation({ expectedEpochId: service.getPollCheckpoint().epochId, batchId: 'recovered', observedAtMs: now, donations: [], complete: true, campaign: { observedAtMs: now, totalCents: 200000, goalCents: 100000 } });
    expect(result.intent).toBeNull(); expect(service.getStatus().campaignTotalCents).toBe(200000);
});
