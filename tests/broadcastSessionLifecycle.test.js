const { createSessionController } = require('../src/broadcastSession');
const { createInitialState } = require('../src/broadcastSession/state');
function memoryStore(initial = null) {
    let state = initial;
    return { load: async () => state, save: async value => { state = value; }, flush: async () => {}, close: async () => {}, archiveAndReset: async () => createInitialState({ mode: 'production', channel: 'streamer' }), recoverLastBackup: async () => state };
}
test('restart retains original start and ledger, emits only snapshots and fences late observations', async () => {
    const store = memoryStore(); const clock = { nowMs: () => 7200000 };
    const options = { store, clock, mode: 'production', channel: 'streamer', graceMs: 900000, cadenceMs: 60000, newSessionId: () => 'id' };
    let controller = await createSessionController(options);
    const snapshots = []; const unsubscribe = controller.subscribe(value => snapshots.push(value));
    await controller.observe({ status: 'online', observedAtMs: 7200000, startedAtMs: 0, streamId: 'one' });
    expect(snapshots).toHaveLength(1); unsubscribe();
    const copy = controller.getSnapshot(); copy.liveTotalCents = 123; expect(controller.getSnapshot().liveTotalCents).toBe(0);
    await controller.stop(); await controller.observe({ status: 'offline', observedAtMs: 7300000 });
    controller = await createSessionController(options); expect(controller.getSnapshot().startedAtMs).toBe(0);
    await controller.reset(); expect(controller.getSnapshot().sessionId).toBeNull(); await controller.recover(); await controller.stop();
});
test('failed load and failed persistence require recovery without losing previous in-memory progress', async () => {
    const store = memoryStore(); store.load = async () => { throw new Error('corrupt'); };
    const controller = await createSessionController({ store, clock: { nowMs: () => 100 }, mode: 'production', channel: 'streamer', graceMs: 900000, cadenceMs: 60000, newSessionId: () => 'id' });
    expect(controller.getStatus().recoveryRequired).toBe(true);
    await expect(controller.observe({ status: 'online', observedAtMs: 100, startedAtMs: 0, streamId: 'one' })).rejects.toThrow(/recovery/i);
    await controller.reset(); store.save = async () => { throw new Error('disk full'); };
    await expect(controller.observe({ status: 'online', observedAtMs: 100, startedAtMs: 0, streamId: 'one' })).rejects.toThrow('disk full');
    expect(controller.getSnapshot().sessionId).toBeNull(); expect(controller.getStatus().recoveryRequired).toBe(true);
    await controller.stop();
});
