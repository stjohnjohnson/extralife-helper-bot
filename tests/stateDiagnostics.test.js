const { createCampaignProgress } = require('../src/streamAvatars/campaignProgress');
const { createCampaignState } = require('../src/streamAvatars/campaignState');
const { createSessionController } = require('../src/gameSession');
const { createInitialState } = require('../src/gameSession/state');
const fs = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createCampaignStore } = require('../src/streamAvatars/campaignStore');
const { createSessionStore } = require('../src/gameSession/store');
const privateMessage = 'TOKEN private-donor private-path';
let controllers;
beforeEach(() => { controllers = []; });
afterEach(async () => { for (const controller of controllers) await controller.stop(); });
async function controller(kind, store, logger) {
    const options = { store, logger, clock: { nowMs: () => 1000 }, mode: 'production', participantId: '12', channel: 'streamer', graceMs: 100, cadenceMs: 100 };
    const value = await (kind === 'campaign' ? createCampaignProgress(options) : createSessionController(options));
    controllers.push(value); return value;
}
function memoryStore(kind) {
    const state = kind === 'campaign' ? createCampaignState({ mode: 'production', participantId: '12' }) : createInitialState({ mode: 'production', channel: 'streamer' });
    return { load: async () => null, save: async () => {}, archiveAndReset: async () => state, recoverLastBackup: async () => state, flush: async () => {}, close: async () => {} };
}
function observe(kind, value) {
    return kind === 'campaign' ? value.acceptObservation({ expectedEpochId: value.getPollCheckpoint().epochId, batchId: 'batch', observedAtMs: 1000, donations: [], complete: true }) : value.observe({ status: 'online', observedAtMs: 1000, startedAtMs: 0, streamId: 'one' });
}
describe.each(['campaign', 'game'])('%s state diagnostics', kind => {
    test.each([['STATE_LOCKED', 'ownership-conflict'], ['STATE_INVALID', 'invalid-state'], ['STATE_RECOVERY_REQUIRED', 'recovery-required'], ['EACCES', 'permission-denied'], ['ENOSPC', 'storage-full'], ['EIO', 'filesystem-error'], ['SECRET', 'state-error']])('reports %s safely at startup and retains the cause without repeating poll warnings', async (code, reason) => {
        const original = Object.assign(new Error(privateMessage), { code });
        const store = memoryStore(kind); store.load = async () => { throw new Error(privateMessage, { cause: original }); };
        const messages = []; const value = await controller(kind, store, { warn: (...args) => messages.push(args) });
        expect(value.getStatus()).toMatchObject({ recoveryRequired: true, stateError: { reason, operation: 'load' } });
        const first = value.getStatus().stateError; first.reason = 'changed';
        expect(value.getStatus().stateError.reason).toBe(reason);
        for (let i = 0; i < 3; i++) await expect(observe(kind, value)).rejects.toMatchObject({ cause: expect.objectContaining({ cause: original }) });
        expect(messages).toHaveLength(1); expect(JSON.stringify(messages)).not.toContain('private'); expect(JSON.stringify(messages)).not.toContain('SECRET');
        await value.reset(); expect(value.getStatus()).toMatchObject({ recoveryRequired: false, stateError: null });
    });
    test.each([[8, 'read-only-filesystem', 'SQLITE_READONLY'], [10, 'filesystem-error', 'SQLITE_IOERR'], [13, 'storage-full', 'SQLITE_FULL'], [14, 'filesystem-error', 'SQLITE_CANTOPEN'], [26, 'invalid-lock', 'SQLITE_NOTADB']])('explains SQLite ownership failure %s without exception text', async (errcode, reason, code) => {
        const store = memoryStore(kind); store.load = async () => { throw Object.assign(new Error(privateMessage), { code: 'ERR_SQLITE_ERROR', errcode }); };
        const messages = [], value = await controller(kind, store, { warn: (...args) => messages.push(args) });
        expect(value.getStatus()).toMatchObject({ stateError: { reason, code, operation: 'load' } });
        expect(JSON.stringify(messages)).not.toContain('private');
    });
    test('reports write and failed recovery errors and clears them after successful recovery', async () => {
        const store = memoryStore(kind), messages = [];
        store.save = async () => { throw Object.assign(new Error(privateMessage), { code: 'ENOSPC' }); };
        const value = await controller(kind, store, { warn: (...args) => messages.push(args) });
        await expect(observe(kind, value)).rejects.toThrow();
        expect(value.getStatus()).toMatchObject({ stateError: { reason: 'storage-full', code: 'ENOSPC', operation: 'save' } });
        store.recoverLastBackup = async () => { throw Object.assign(new Error(privateMessage), { code: 'ENOENT' }); };
        await expect(value.recover()).rejects.toThrow();
        await expect(value.recover()).rejects.toThrow();
        expect(value.getStatus()).toMatchObject({ stateError: { reason: 'missing-file', operation: 'recover' } });
        store.archiveAndReset = async () => { throw Object.assign(new Error(privateMessage), { code: 'EACCES' }); };
        await expect(value.reset()).rejects.toThrow();
        expect(value.getStatus()).toMatchObject({ stateError: { reason: 'permission-denied', operation: 'reset' } });
        store.recoverLastBackup = memoryStore(kind).recoverLastBackup; store.save = async () => {};
        await value.recover(); expect(value.getStatus()).toMatchObject({ recoveryRequired: false, stateError: null });
        expect(messages).toHaveLength(3); expect(JSON.stringify(messages)).not.toContain('private');
    });
    test('temporary read failures never quarantine valid saved state', async () => {
        const dir = await fs.mkdtemp(join(tmpdir(), 'state-io-'));
        const file = join(dir, 'state.json'); await fs.writeFile(file, 'private-original-bytes');
        const faultFs = { ...fs, readFile: async () => { throw Object.assign(new Error(privateMessage), { code: 'EIO' }); } };
        const store = kind === 'campaign' ? createCampaignStore({ path: file, mode: 'production', participantId: '12', fs: faultFs }) : createSessionStore({ path: file, mode: 'production', channel: 'streamer', fs: faultFs });
        try {
            await expect(store.load()).rejects.toMatchObject({ code: 'EIO' });
            expect(await fs.readFile(file, 'utf8')).toBe('private-original-bytes');
            expect((await fs.readdir(dir)).some(name => /quarantine|recovery-required/.test(name))).toBe(false);
        } finally { await store.close(); await fs.rm(dir, { recursive: true, force: true }); }
    });
});
