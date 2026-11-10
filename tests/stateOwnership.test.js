const fs = require('node:fs/promises');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createCampaignStore } = require('../src/streamAvatars/campaignStore');
const { createCampaignState } = require('../src/streamAvatars/campaignState');
const { createSessionStore } = require('../src/gameSession/store');
const { createInitialState } = require('../src/gameSession/state');
let dir, stores, children;
beforeEach(async () => { dir = await fs.mkdtemp(join(tmpdir(), 'state-ownership-')); stores = []; children = []; });
afterEach(async () => {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) { const exit = once(child, 'exit'); child.kill('SIGKILL'); await exit; }
    for (const store of stores) await store.close();
    await fs.rm(dir, { recursive: true, force: true });
});
const makeStore = (kind, path) => {
    const store = kind === 'campaign' ? createCampaignStore({ path, mode: 'production', participantId: '12' }) : createSessionStore({ path, mode: 'production', channel: 'streamer' });
    stores.push(store); return store;
};
const initial = kind => ({ ...(kind === 'campaign' ? createCampaignState({ mode: 'production', participantId: '12' }) : createInitialState({ mode: 'production', channel: 'streamer' })), revision: 7 });
async function childOwner(kind, file) {
    const child = fork(join(__dirname, 'fixtures/state-owner.js'), [kind, file], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    children.push(child);
    const [message] = await once(child, 'message');
    return { child, message };
}
describe.each(['campaign', 'game'])('%s state ownership', kind => {
    test('automatically archives a legacy lock without changing saved progress', async () => {
        const file = join(dir, 'state.json'), state = initial(kind);
        await fs.writeFile(file, JSON.stringify(state));
        await fs.writeFile(file + '.lock', '{"pid":1}');
        expect(await makeStore(kind, file).load()).toEqual(state);
        expect(await fs.readFile(file, 'utf8')).toBe(JSON.stringify(state));
        expect((await fs.readdir(dir)).some(name => name.startsWith('state.json.lock.archive-'))).toBe(true);
    });
    test('blocks another process while the owner lives and reloads saved state after SIGKILL', async () => {
        const file = join(dir, 'state.json'), state = initial(kind);
        await fs.writeFile(file, JSON.stringify(state));
        const owner = await childOwner(kind, file); expect(owner.message).toEqual({ ready: true });
        const contender = makeStore(kind, file);
        await expect(contender.load()).rejects.toMatchObject({ code: 'STATE_LOCKED' });
        await contender.close();
        const exit = once(owner.child, 'exit'); owner.child.kill('SIGKILL'); await exit;
        expect(await makeStore(kind, file).load()).toEqual(state);
    });
    test('only one simultaneous startup owns the store', async () => {
        const file = join(dir, 'state.json');
        const contenders = await Promise.all([childOwner(kind, file), childOwner(kind, file)]);
        expect(contenders.map(value => value.message)).toEqual(expect.arrayContaining([{ ready: true }]));
        expect(contenders.map(value => value.message).filter(message => message.error)).toEqual([{ error: 'STATE_LOCKED' }]);
    });
    test('directory aliases cannot bypass live ownership', async () => {
        const file = join(dir, 'state.json');
        await makeStore(kind, file).load();
        const alias = join(dir, 'alias'); await fs.symlink(dir, alias, 'dir');
        await expect(makeStore(kind, join(alias, 'state.json')).load()).rejects.toMatchObject({ code: 'STATE_LOCKED' });
    });
    test.each(['symlink', 'hardlink'])('refuses a %s ownership database', async type => {
        const file = join(dir, 'state.json'), target = join(dir, 'target'); await fs.writeFile(target, '');
        if (type === 'symlink') await fs.symlink(target, file + '.ownership.sqlite');
        else await fs.link(target, file + '.ownership.sqlite');
        await expect(makeStore(kind, file).load()).rejects.toMatchObject({ code: 'STATE_LOCK_INVALID' });
    });
    test('a failed legacy migration releases new ownership for a retry', async () => {
        const file = join(dir, 'state.json');
        await fs.mkdir(file + '.lock');
        // A legacy lock must be a regular file; never move an unexpected directory.
        await expect(makeStore(kind, file).load()).rejects.toMatchObject({ code: 'STATE_LOCK_INVALID' });
        await fs.rmdir(file + '.lock');
        expect(await makeStore(kind, file).load()).toBeNull();
    });
});
