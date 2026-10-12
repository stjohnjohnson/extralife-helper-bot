const fs = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createCampaignStore, assertDistinctPaths } = require('../src/streamAvatars/campaignStore');
const { createCampaignState } = require('../src/streamAvatars/campaignState');
let dir;
let stores;
beforeEach(async () => { dir = await fs.mkdtemp(join(tmpdir(), 'sa-session-')); stores = []; });
afterEach(async () => { for (const store of stores) await store.close(); await fs.rm(dir, { recursive: true, force: true }); });
function store(extra = {}) {
    const value = createCampaignStore({ path: join(dir, 'campaign.json'), mode: 'production', participantId: '12', ...extra });
    stores.push(value); return value;
}
const state = revision => ({ ...createCampaignState({ mode: 'production', participantId: '12' }), revision, processedDonationIds: ['donation-1'], donationCheckpointCount: 5 });
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
    expect(JSON.parse(await fs.readFile(join(dir, 'campaign.json'), 'utf8'))).toEqual(state(2));
    fail = false; await Promise.all([value.save(state(4)), value.save(state(3))]);
    expect(JSON.parse(await fs.readFile(join(dir, 'campaign.json'), 'utf8')).revision).toBe(4);
    expect((await fs.readdir(dir)).filter(name => name.endsWith('.tmp'))).toEqual([]);
});
test('corrupt state is quarantined and recovery uses validated last backup', async () => {
    const value = store(); await value.load(); await value.save(state(1)); await value.save(state(2)); await value.close();
    await fs.writeFile(join(dir, 'campaign.json'), '{broken');
    const next = store(); await expect(next.load()).rejects.toThrow(/recovery/i);
    expect((await fs.readdir(dir)).some(name => name.includes('quarantine'))).toBe(true);
    expect(await next.recoverLastBackup()).toEqual(state(1));
    const reset = await next.archiveAndReset(); expect(reset.donationCheckpointCount).toBe(0);
    expect((await fs.readdir(dir)).some(name => name.includes('archive'))).toBe(true);
});
test('rejects wrong mode and aliased stores through links', async () => {
    await fs.writeFile(join(dir, 'campaign.json'), JSON.stringify({ ...state(1), mode: 'rehearsal' }));
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
    await fs.writeFile(join(dir, 'target'), '{}'); await fs.symlink(join(dir, 'target'), join(dir, 'campaign.json'));
    await expect(store().load()).rejects.toThrow(/link/i);
    await fs.unlink(join(dir, 'campaign.json'));
    const value = store(); await value.load();
    await fs.writeFile(join(dir, 'campaign.json.backup'), '{}');
    await expect(value.recoverLastBackup()).rejects.toThrow(/state/i);
    await value.close(); await expect(value.save(state(1))).rejects.toThrow(/closed/i);
});

test('quarantine requires explicit recovery across repeated process restarts', async () => {
    const first = store(); await first.load(); await first.save(state(1)); await first.save(state(2)); await first.close();
    await fs.writeFile(join(dir, 'campaign.json'), '{broken');
    const quarantining = store(); await expect(quarantining.load()).rejects.toThrow(/recovery/i); await quarantining.close();
    const restarted = store(); await expect(restarted.load()).rejects.toThrow(/recovery/i);
    await restarted.recoverLastBackup(); await restarted.close();
    const restored = store(); expect(await restored.load()).toMatchObject({ donationCheckpointCount: 5, processedDonationIds: ['donation-1'] }); await restored.close();
    await fs.writeFile(join(dir, 'campaign.json'), '{broken-again');
    const corruptAgain = store(); await expect(corruptAgain.load()).rejects.toThrow(/recovery/i); await corruptAgain.close();
    const resetting = store(); await expect(resetting.load()).rejects.toThrow(/recovery/i); await resetting.archiveAndReset(); await resetting.close();
    expect(await store().load()).toMatchObject({ campaignObservation: null, donationCheckpointCount: 0 });
});

test('crash between recovery marker and quarantine preserves the good backup on explicit reset', async () => {
    await fs.writeFile(join(dir, 'campaign.json'), '{broken');
    await fs.writeFile(join(dir, 'campaign.json.backup'), JSON.stringify(state(1)));
    await fs.writeFile(join(dir, 'campaign.json.recovery-required'), 'corrupt-state');
    const value = store(); await expect(value.load()).rejects.toThrow(/recovery/i); await value.archiveAndReset();
    expect(JSON.parse(await fs.readFile(join(dir, 'campaign.json.backup'), 'utf8'))).toEqual(state(1));
});

test('participant change archives progress; legacy broadcast state is untouched', async()=>{
    const legacy=join(dir,'state.json');await fs.writeFile(legacy,'private-legacy-fixture');
    const first=store();await first.load();await first.save(state(1));await first.close();
    const next=store({participantId:'13'});expect(await next.load()).toMatchObject({participantId:'13',donationCheckpointCount:0});
    expect(await fs.readFile(legacy,'utf8')).toBe('private-legacy-fixture');expect((await fs.readdir(dir)).some(name=>name.includes('archive'))).toBe(true);
});
