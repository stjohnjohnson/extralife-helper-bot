const fs = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createDonationReplay } = require('../src/donations/replay');

let directory;
beforeEach(async () => { directory = await fs.mkdtemp(join(tmpdir(), 'donation-replay-')); });
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });
const donation = id => ({ donationID: id, amount: 25 });
const replay = (options = {}) => createDonationReplay({ participantId: '12', directory, ...options });

test('a missing file silently saves the latest ID and reloads it after restart', async () => {
    const service = replay();
    expect(await service.load()).toBeNull();
    const announce = jest.fn();
    await service.process({ donations: [donation('B'), donation('A')], baseline: true }, announce);
    expect(announce).not.toHaveBeenCalled();
    expect(await replay().load()).toEqual({ lastDonationId: 'B' });
});

test('an empty baseline persists initialization and announces the first later donation', async () => {
    const service = replay();
    await service.load();
    await service.process({ donations: [], baseline: true }, jest.fn());
    expect(await replay().load()).toEqual({ lastDonationId: null });
    const delivered = [];
    await service.process({ donations: [donation('A')], baseline: false }, async d => delivered.push(d.donationID));
    expect(delivered).toEqual(['A']);
    expect(await replay().load()).toEqual({ lastDonationId: 'A' });
});

test('each donation is saved before the next announcement and restart resumes at the failed donation', async () => {
    const service = replay();
    await service.load();
    await service.process({ donations: [donation('A')], baseline: true }, jest.fn());
    const delivered = [];
    await expect(service.process({ donations: ['D', 'C', 'B'].map(donation), baseline: false }, async d => {
        delivered.push(d.donationID);
        if (d.donationID === 'C') {
            expect(await replay().load()).toEqual({ lastDonationId: 'B' });
            throw new Error('Twitch disconnected');
        }
    })).rejects.toThrow('Twitch disconnected');
    expect(delivered).toEqual(['B', 'C']);
    const restarted = replay();
    expect(await restarted.load()).toEqual({ lastDonationId: 'B' });
    await restarted.process({ donations: ['D', 'C'].map(donation), baseline: false }, async d => delivered.push(d.donationID));
    expect(delivered).toEqual(['B', 'C', 'C', 'D']);
    expect(await replay().load()).toEqual({ lastDonationId: 'D' });
});

test('a failed atomic replacement retains the old checkpoint and retries the same donation', async () => {
    const initial = replay();
    await initial.load();
    await initial.process({ donations: [donation('A')], baseline: true }, jest.fn());
    const service = replay({ fs: { ...fs, rename: async () => { throw new Error('disk unavailable'); } } });
    await service.load();
    const announce = jest.fn();
    await expect(service.process({ donations: ['C', 'B'].map(donation), baseline: false }, announce)).rejects.toThrow('disk unavailable');
    expect(announce.mock.calls.map(([d]) => d.donationID)).toEqual(['B']);
    expect(await replay().load()).toEqual({ lastDonationId: 'A' });
    expect(await service.load()).toEqual({ lastDonationId: 'A' });
    expect((await fs.readdir(directory)).filter(name => name.endsWith('.tmp'))).toEqual([]);
});

test('participants keep independent checkpoints, including IDs containing path separators', async () => {
    const first = replay(); const second = replay({ participantId: '../other' });
    await first.load(); await second.load();
    await first.process({ donations: [donation('A')], baseline: true }, jest.fn());
    expect(await second.load()).toBeNull();
    await second.process({ donations: [donation('Z')], baseline: true }, jest.fn());
    expect(await replay().load()).toEqual({ lastDonationId: 'A' });
    expect(await replay({ participantId: '../other' }).load()).toEqual({ lastDonationId: 'Z' });
});

test.each(['not json', '{}', '{"version":2,"participantId":"12","lastDonationId":"A"}', '{"version":1,"participantId":"wrong","lastDonationId":"A"}', '{"version":1,"participantId":"12","lastDonationId":""}'])('corrupt state never becomes a fresh baseline: %s', async contents => {
    await fs.writeFile(join(directory, '12.json'), contents);
    await expect(replay().load()).rejects.toThrow();
    expect(await fs.readFile(join(directory, '12.json'), 'utf8')).toBe(contents);
});

test('read failures other than a missing file are reported', async () => {
    const service = replay({ fs: { ...fs, readFile: async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); } } });
    await expect(service.load()).rejects.toThrow('denied');
});

test('shutdown during an announcement prevents checkpoint advancement and further delivery', async () => {
    const service = replay(); await service.load();
    await service.process({ donations: [donation('A')], baseline: true }, jest.fn());
    const controller = new AbortController();
    const announce = jest.fn(async () => { controller.abort(); });
    await expect(service.process({ donations: ['C', 'B'].map(donation), baseline: false }, announce, controller.signal)).rejects.toThrow();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(await replay().load()).toEqual({ lastDonationId: 'A' });
});
