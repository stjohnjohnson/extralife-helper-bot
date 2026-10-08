const fs = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createSessionStore, assertDistinctPaths } = require('../src/broadcastSession/store');
const { createInitialState } = require('../src/broadcastSession/state');
let dir;
let stores;
beforeEach(async () => { dir = await fs.mkdtemp(join(tmpdir(), 'sa-session-')); stores = []; });
afterEach(async () => { for (const store of stores) await store.close(); await fs.rm(dir, { recursive: true, force: true }); });
function store(extra = {}) {
    const value = createSessionStore({ path: join(dir, 'state.json'), mode: 'production', channel: 'streamer', ...extra });
    stores.push(value); return value;
}
const state = revision => ({ ...createInitialState({ mode: 'production', channel: 'streamer' }), revision, processedDonationIds: ['donation-1'], liveTotalCents: 2500, reachedTimeCheckpoints: [1, 5] });
test('persists complete ledger and rejects another owner, then reloads after close', async () => {
    const first = store(); expect(await first.load()).toBeNull(); await first.save(state(1));
    await expect(store().load()).rejects.toThrow(/owner/i);
    await first.close(); expect(await store().load()).toEqual(state(1));
});
test('failed atomic rename preserves previous good state and older revisions cannot overwrite', async () => {
    let fail = false;
    const faultFs = { ...fs, rename: async (...args) => { if (fail) throw new Error('disk failure'); return fs.rename(...args); } };
    const value = store({ fs: faultFs }); await value.load(); await value.save(state(2));
    fail = true; await expect(value.save(state(3))).rejects.toThrow('disk failure');
    expect(JSON.parse(await fs.readFile(join(dir, 'state.json'), 'utf8'))).toEqual(state(2));
    fail = false; await Promise.all([value.save(state(4)), value.save(state(3))]);
    expect(JSON.parse(await fs.readFile(join(dir, 'state.json'), 'utf8')).revision).toBe(4);
    expect((await fs.readdir(dir)).filter(name => name.endsWith('.tmp'))).toEqual([]);
});
test('corrupt state is quarantined and recovery uses validated last backup', async () => {
    const value = store(); await value.load(); await value.save(state(1)); await value.save(state(2)); await value.close();
    await fs.writeFile(join(dir, 'state.json'), '{broken');
    const next = store(); await expect(next.load()).rejects.toThrow(/recovery/i);
    expect((await fs.readdir(dir)).some(name => name.includes('quarantine'))).toBe(true);
    expect(await next.recoverLastBackup()).toEqual(state(1));
    const reset = await next.archiveAndReset(); expect(reset.liveTotalCents).toBe(0);
    expect((await fs.readdir(dir)).some(name => name.includes('archive'))).toBe(true);
});
test('rejects wrong mode and aliased stores through links', async () => {
    await fs.writeFile(join(dir, 'state.json'), JSON.stringify({ ...state(1), mode: 'rehearsal' }));
    await expect(store().load()).rejects.toThrow(/recovery/i);
    const file = join(dir, 'first'); const link = join(dir, 'second');
    await fs.writeFile(file, '{}'); await fs.symlink(file, link);
    await expect(assertDistinctPaths(file, link)).rejects.toThrow(/separate/i);
    await fs.unlink(link); await fs.link(file, link);
    await expect(assertDistinctPaths(file, link)).rejects.toThrow(/separate/i);
    await expect(assertDistinctPaths(file, join(dir, '.', 'first'))).rejects.toThrow(/separate/i);
    await expect(assertDistinctPaths(file, join(dir, 'new'))).resolves.toBeUndefined();
});
test('symlink state and invalid backup are refused; close fences writes', async () => {
    await fs.writeFile(join(dir, 'target'), '{}'); await fs.symlink(join(dir, 'target'), join(dir, 'state.json'));
    await expect(store().load()).rejects.toThrow(/link/i);
    await fs.unlink(join(dir, 'state.json'));
    const value = store(); await value.load();
    await fs.writeFile(join(dir, 'state.json.backup'), '{}');
    await expect(value.recoverLastBackup()).rejects.toThrow(/state/i);
    await value.close(); await expect(value.save(state(1))).rejects.toThrow(/closed/i);
});
