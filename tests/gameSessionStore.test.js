const fs = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createSessionStore } = require('../src/gameSession/store');
const { createInitialState } = require('../src/gameSession/state');
let dir, stores;
beforeEach(async () => { dir = await fs.mkdtemp(join(tmpdir(), 'game-store-')); stores = []; });
afterEach(async () => { for (const store of stores) await store.close(); await fs.rm(dir, { recursive: true, force: true }); });
test('primary and recovery backup strictly migrate version1 ledgers in memory', async () => {
    const legacy = { ...createInitialState({ mode: 'production', channel: 'streamer' }), revision: 5, liveTotalCents: 2500, processedDonationIds: ['donation-1'], schemaVersion: 1, chapter: 2, reachedDonationCheckpoints: [25], campaignGoalReached: true }; delete legacy.game;
    const file = join(dir, 'state.json'); await fs.writeFile(file, JSON.stringify(legacy));
    const primary = createSessionStore({ path: file, mode: 'production', channel: 'streamer' }); stores.push(primary); expect(await primary.load()).toEqual({ ...legacy, schemaVersion: 2, game: null }); await primary.close();
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual(legacy);
    await fs.writeFile(file + '.backup', JSON.stringify(legacy)); await fs.writeFile(file, '{bad');
    const recovering = createSessionStore({ path: file, mode: 'production', channel: 'streamer' }); stores.push(recovering); await expect(recovering.load()).rejects.toMatchObject({ message: expect.stringMatching(/recovery/i), cause: expect.any(SyntaxError) });
    const restored = await recovering.recoverLastBackup(); expect(restored).toMatchObject({ schemaVersion: 2, game: null, chapter: 2, liveTotalCents: 2500, processedDonationIds: ['donation-1'], reachedDonationCheckpoints: [25], campaignGoalReached: true });
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toMatchObject({ schemaVersion: 2, game: null });
});

test('retains the filesystem cause when a second store attempts to acquire ownership', async () => {
    const file = join(dir, 'state.json');
    const first = createSessionStore({ path: file, mode: 'production', channel: 'streamer' }); stores.push(first);
    expect(await first.load()).toBeNull();
    const second = createSessionStore({ path: file, mode: 'production', channel: 'streamer' }); stores.push(second);
    await expect(second.load()).rejects.toMatchObject({
        message: expect.stringMatching(/owner/i),
        cause: expect.objectContaining({ code: 'EEXIST', path: file + '.lock' })
    });
});
