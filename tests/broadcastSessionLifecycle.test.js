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
const { loadThemeConfiguration } = require('../src/streamAvatars/themes');
async function gameController(store = memoryStore()) {
    const controller = await createSessionController({ store, clock: { nowMs: () => 1000 }, mode: 'production', channel: 'streamer', graceMs: 100, cadenceMs: 100, newSessionId: () => 'id', gameConfig: loadThemeConfiguration().config });
    await controller.observe({ status: 'online', observedAtMs: 900, startedAtMs: 0, streamId: 'one' });
    return controller;
}
const game = (gameName, observedAtMs, source = 'twitch') => ({ gameName, observedAtMs, source });
test('persisted game precedes entrance notification; duplicate advances watermark without disk rewrites', async () => {
    const store = memoryStore(); const saved = []; const save = store.save; store.save = async state => { saved.push(structuredClone(state)); await save(state); };
    const controller = await gameController(store); const notifications = []; controller.subscribe((state, change) => notifications.push({ state, change, durable: saved.at(-1) }));
    await controller.observeGame(game('Minecraft', 901));
    await controller.observeGame(game('Minecraft Bedrock', 950), { announce: true });
    await controller.observeGame(game('Raft', 940, 'discord-category'), { announce: true });
    expect(saved).toHaveLength(2); expect(notifications).toHaveLength(1); expect(controller.getSnapshot().game.displayName).toBe('Minecraft');
    await controller.observeGame(game('Raft', 960), { announce: true });
    expect(notifications.at(-1)).toMatchObject({ change: { announce: true }, durable: { game: { displayName: 'Raft' } }, state: { game: { displayName: 'Raft' } } });
    await controller.stop();
});
test('ties prefer Twitch, stale polls cannot replace PATCH, invalid and missing names retain state', async () => {
    const controller = await gameController();
    await controller.observeGame(game('Raft', 950, 'discord-category'));
    await controller.observeGame(game('Minecraft', 940)); expect(controller.getSnapshot().game.displayName).toBe('Raft');
    await controller.observeGame(game('PlateUp!', 950)); expect(controller.getSnapshot().game.displayName).toBe('PlateUp!');
    await controller.observeGame(game('Raft', 950, 'discord-category'));
    for (const value of [game('', 980), game(null, 980), game('Minecraft', -1), game('Minecraft', 990, 'presence')]) await controller.observeGame(value);
    expect(controller.getSnapshot().game.displayName).toBe('PlateUp!'); await controller.stop();
});
test('game writes share session serialization and cannot revive ended or reset sessions', async () => {
    const controller = await gameController();
    await Promise.all([controller.observeGame(game('Minecraft', 901)), controller.observe({ status: 'offline', observedAtMs: 1000 }), controller.observeGame(game('Raft', 1001))]);
    expect(controller.getSnapshot().game.displayName).toBe('Minecraft');
    await controller.observe({ status: 'offline', observedAtMs: 1100 }); expect(controller.getSnapshot().game).toBeNull();
    await controller.reset(); await controller.observeGame(game('Raft', 1200)); expect(controller.getSnapshot().game).toBeNull(); await controller.stop();
});
test('failed game persistence emits no snapshot or entrance and requires recovery', async () => {
    const store = memoryStore(); const controller = await gameController(store); const notifications = []; controller.subscribe((...args) => notifications.push(args));
    store.save = async () => { throw new Error('disk full'); };
    await expect(controller.observeGame(game('Minecraft', 901), { announce: true })).rejects.toThrow('disk full');
    expect(controller.getSnapshot().game).toBeNull(); expect(notifications).toEqual([]); expect(controller.getStatus().recoveryRequired).toBe(true); await controller.stop();
});
test('duplicate Twitch observation promotes tie priority without persisting; newer status saves retain original game', async () => {
    const controller = await gameController();
    await controller.observeGame(game('Minecraft', 910, 'discord-category')); const revision = controller.getSnapshot().revision;
    await controller.observeGame(game('Minecraft', 950)); await controller.observeGame(game('Raft', 950, 'discord-category'));
    expect(controller.getSnapshot()).toMatchObject({ revision, game: { displayName: 'Minecraft' } });
    await controller.observe({ status: 'online', observedAtMs: 960, startedAtMs: 0, streamId: 'one' });
    await controller.observeGame(game('Raft', 940)); expect(controller.getSnapshot().game.displayName).toBe('Minecraft'); await controller.stop();
});
test('successful category write fences overlapping reads until confirmation; later reads and Twitch ties still win', async () => {
    const controller = await gameController();
    await controller.observeGame(game('Minecraft', 901));
    await controller.observeGame({ ...game('PlateUp!', 910, 'discord-category'), confirmedAtMs: 930 });
    const revision = controller.getSnapshot().revision;
    await controller.observeGame(game('Minecraft', 920), { announce: true });
    expect(controller.getSnapshot()).toMatchObject({ revision, game: { displayName: 'PlateUp!', observedAtMs: 930, source: 'discord-category' } });
    await controller.observeGame(game('Raft', 931)); expect(controller.getSnapshot().game).toMatchObject({ displayName: 'Raft', observedAtMs: 931 });
    await controller.observeGame({ ...game('PlateUp!', 940, 'discord-category'), confirmedAtMs: 950 });
    await controller.observeGame(game('PEAK', 950)); expect(controller.getSnapshot().game.displayName).toBe('PEAK');
    await controller.stop();
});
