const { HueController } = require('../src/hueControl');
const { createRehearsalController, parseAction } = require('../src/streamAvatars/rehearsal');
const { createSessionController } = require('../src/broadcastSession');
const { createInitialState } = require('../src/broadcastSession/state');
const { createVirtualClock } = require('../src/streamAvatars/clock');
const lights = [{ id: '1', state: { on: true, bri: 100 } }];
let rehearsal; let hue;
beforeEach(async () => {
    hue = new HueController({ hue: { groupId: '1' } }, { info() {}, warn() {}, error() {} });
    hue.connected = true; hue.group = { lights: ['1'] };
    hue.getGroupLights = jest.fn().mockResolvedValue(lights);
    hue.flashLightsWithRandomColors = jest.fn().mockResolvedValue();
    hue.restoreLightStates = jest.fn().mockResolvedValue();
    const clock = createVirtualClock({ nowMs: 1000 });
    const store = { load: async () => null, save: async () => {}, close: async () => {}, flush: async () => {}, archiveAndReset: async () => createInitialState({ mode: 'rehearsal', channel: 'streamer' }) };
    rehearsal = await createRehearsalController({ createSession: () => createSessionController({ store, clock, mode: 'rehearsal', channel: 'streamer', graceMs: 900000, cadenceMs: 60000 }), clock,
        realClock: { nowMs: () => 1000 }, standalone: true, productionStatus: () => null,
        bridge: { disconnectClients() {} }, eventDispatcher: { publishHearts: () => true }, hue: () => hue, notify() {}, graceMs: 900000, cadenceMs: 60000 });
    await rehearsal.dispatch(parseAction('rehearsal start')); await rehearsal.dispatch(parseAction('hue on'));
});
afterEach(async () => { await hue.stop(); await rehearsal.stop(); });
const cancel = action => action === 'real-live' ? rehearsal.observeProduction({ status: 'online', observedAtMs: 1001, startedAtMs: 1000, streamId: 'real' }) : rehearsal.dispatch(parseAction(action));
test.each(['real-live', 'rehearsal stop', 'rehearsal reset', 'hue off'])('delayed rehearsal light reads cannot launch an effect after %s', async action => {
    let release; let reading;
    const started = new Promise(resolve => { reading = resolve; });
    hue.getGroupLights.mockImplementationOnce(() => { reading(); return new Promise(resolve => { release = resolve; }); });
    const animation = jest.spyOn(hue, 'runCelebrationAnimation').mockResolvedValue();
    const preview = rehearsal.dispatch(parseAction('hearts')); await started;
    const effect = hue.activeEffect; const cancellation = cancel(action); release(lights);
    await preview; await cancellation; await effect.done;
    expect(animation).not.toHaveBeenCalled(); expect(hue.restoreLightStates).not.toHaveBeenCalled();
    await hue.celebrateDonation(); await hue.activeEffect?.done;
    expect(animation).toHaveBeenCalledTimes(1); expect(hue.connected).toBe(true);
});
test.each(['real-live', 'rehearsal stop', 'rehearsal reset', 'hue off'])('running rehearsal animation stops and restores without disabling production Hue after %s', async action => {
    await rehearsal.dispatch(parseAction('hearts')); const effect = hue.activeEffect;
    const cancellation = cancel(action);
    expect(effect.abort.signal.aborted).toBe(true);
    await cancellation; await effect.done;
    expect(hue.restoreLightStates).toHaveBeenCalledTimes(1); expect(hue.connected).toBe(true);
    expect(hue.activeEffect).toBeNull();
});
