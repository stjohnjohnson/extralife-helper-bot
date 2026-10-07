const { v3 } = require('node-hue-api');
const { HueController } = require('../src/hueControl.js');
const { handleCommand } = require('../src/commands.js');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

describe('coordinated Hue chat effects', () => {
    let controller;
    let api;
    let lights;
    let writes;
    let logger;

    beforeEach(async () => {
        jest.useFakeTimers();
        jest.setSystemTime(0);
        lights = [
            { id: '1', state: { on: true, bri: 80, colormode: 'xy', xy: [0.2, 0.3] } },
            { id: '2', state: { on: false, bri: 100, colormode: 'hs', hue: 12000, sat: 150 } },
            { id: '3', state: { on: true, bri: 180, colormode: 'ct', ct: 350 } }
        ];
        writes = [];
        logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
        api = {
            groups: {
                getAll: jest.fn().mockResolvedValue([{ id: 1, name: 'Stream', lights: ['1', '2', '3'] }]),
                setGroupState: jest.fn(async (id, state) => {
                    const payload = state.getPayload();
                    writes.push({ group: id, payload });
                    lights.forEach(light => Object.assign(light.state, payload, { colormode: 'hs' }));
                })
            },
            lights: {
                getLight: jest.fn(async id => structuredClone(lights.find(light => light.id === id))),
                setLightState: jest.fn(async (id, state) => {
                    const payload = state.getPayload();
                    writes.push({ light: id, payload });
                    const colormode = payload.xy ? 'xy' : payload.ct ? 'ct' : 'hs';
                    Object.assign(lights.find(light => light.id === id).state, payload, { colormode });
                })
            }
        };
        jest.spyOn(v3.api, 'createLocal').mockReturnValue({ connect: jest.fn().mockResolvedValue(api) });
        controller = new HueController({ hue: { ipAddress: '192.168.1.2', username: 'key', groupId: '1', chatControlEnabled: true } }, logger);
        await controller.initialize();
    });

    afterEach(async () => {
        const stopping = controller.stop?.();
        await jest.runAllTimersAsync();
        await stopping;
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    test('sets group HSV from a color without changing its power state', async () => {
        expect(await controller.requestColor('red')).toEqual({ status: 'applied' });
        expect(writes).toEqual([{ group: '1', payload: { hue: 0, sat: 254, bri: 254 } }]);
        expect(lights[1].state.on).toBe(false);
    });

    test('Twitch and Discord share steady-color admission through the real command handler', async () => {
        const run = (platform, command) => handleCommand(command, platform, { userId: 'viewer', username: 'viewer' }, controller.config, {}, logger, controller);
        expect(await run('twitch', 'color red')).toBeNull();
        expect(await run('discord', 'color blue')).toMatch(/wait/i);
        expect(writes).toHaveLength(1);
        await jest.advanceTimersByTimeAsync(1000);
        expect(await run('discord', 'color blue')).toBeNull();
        expect(writes).toHaveLength(2);
    });

    test('Twitch and Discord share party limits and donation busy replies', async () => {
        const run = (platform, command) => handleCommand(command, platform, { userId: 'viewer', username: 'viewer' }, controller.config, {}, logger, controller);
        expect(await run('discord', 'color party')).toMatch(/party started/i);
        expect(await run('twitch', 'color red')).toMatch(/busy/i);
        await controller.celebrateDonation();
        expect(await run('discord', 'color red')).toMatch(/busy/i);
        await jest.advanceTimersByTimeAsync(5600);
        expect(await run('twitch', 'color party')).toMatch(/wait/i);
        expect(writes.filter(write => write.group)).toHaveLength(1);
    });

    test('admits one steady color every second', async () => {
        await controller.requestColor('red');
        await jest.advanceTimersByTimeAsync(999);
        expect(await controller.requestColor('blue')).toEqual({ status: 'cooldown', retryAfterMs: 1 });
        await jest.advanceTimersByTimeAsync(1);
        expect(await controller.requestColor('blue')).toEqual({ status: 'applied' });
        expect(writes).toHaveLength(2);
    });

    test('invalid and disconnected requests leave the steady cooldown available', async () => {
        expect(await controller.requestColor('red blue')).toEqual({ status: 'invalid' });
        controller.connected = false;
        expect(await controller.requestColor('red')).toEqual({ status: 'unavailable' });
        controller.connected = true;
        expect(await controller.requestColor('red')).toEqual({ status: 'applied' });
    });

    test('disabled controls leave donation celebrations available', async () => {
        controller.config.hue.chatControlEnabled = false;
        expect(await controller.requestColor('red')).toEqual({ status: 'disabled' });
        await controller.celebrateDonation();
        expect(writes.some(write => write.light)).toBe(true);
    });

    test('reserves concurrent steady writes before awaiting bridge I/O', async () => {
        const pending = deferred();
        api.groups.setGroupState.mockImplementationOnce(() => pending.promise);
        const first = controller.requestColor('red');
        expect(await controller.requestColor('blue')).toEqual({ status: 'busy' });
        pending.resolve();
        expect(await first).toEqual({ status: 'applied' });
        expect(api.groups.setGroupState).toHaveBeenCalledTimes(1);
    });

    test('reports bridge write failures and retains the admitted cooldown', async () => {
        api.groups.setGroupState.mockRejectedValueOnce(new Error('offline'));
        expect(await controller.requestColor('red')).toEqual({ status: 'unavailable' });
        expect(await controller.requestColor('blue')).toEqual({ status: 'cooldown', retryAfterMs: 1000 });
    });

    test('runs fifteen party frames then restores all original color modes', async () => {
        expect(await controller.requestColor('party')).toEqual({ status: 'party' });
        await jest.advanceTimersByTimeAsync(15000);
        expect(writes.filter(write => write.group)).toHaveLength(15);
        expect(await controller.requestColor('blue')).toEqual({ status: 'busy' });
        await jest.advanceTimersByTimeAsync(300);
        expect(writes.filter(write => write.light)).toEqual([
            { light: '1', payload: { on: true, bri: 80, xy: [0.2, 0.3] } },
            { light: '2', payload: { on: false, bri: 100, hue: 12000, sat: 150 } },
            { light: '3', payload: { on: true, bri: 180, ct: 350 } }
        ]);
        const completedWrites = writes.length;
        await jest.advanceTimersByTimeAsync(10000);
        expect(writes).toHaveLength(completedWrites);
        expect(await controller.requestColor('blue')).toEqual({ status: 'applied' });
    });

    test('shares one-minute party admission independently of steady colors', async () => {
        await controller.requestColor('party');
        await jest.advanceTimersByTimeAsync(15300);
        await controller.requestColor('red');
        expect(await controller.requestColor('party')).toEqual({ status: 'cooldown', retryAfterMs: 44700 });
        await jest.advanceTimersByTimeAsync(44699);
        expect(await controller.requestColor('party')).toEqual({ status: 'cooldown', retryAfterMs: 1 });
        await jest.advanceTimersByTimeAsync(1);
        expect(await controller.requestColor('party')).toEqual({ status: 'party' });
    });

    test('busy requests do not postpone party admission', async () => {
        await controller.requestColor('party');
        await jest.advanceTimersByTimeAsync(1000);
        expect(await controller.requestColor('party')).toEqual({ status: 'busy' });
        await jest.advanceTimersByTimeAsync(59000);
        expect(await controller.requestColor('party')).toEqual({ status: 'party' });
    });

    test('refuses a party when any pre-party light state cannot be saved', async () => {
        api.lights.getLight.mockRejectedValueOnce(new Error('light unavailable'));
        expect(await controller.requestColor('party')).toEqual({ status: 'unavailable' });
        expect(writes).toHaveLength(0);
        expect(await controller.requestColor('party')).toEqual({ status: 'party' });
    });

    test('restores pre-party state after donation cancels the party', async () => {
        await controller.requestColor('party');
        await jest.advanceTimersByTimeAsync(2500);
        const partyFrames = writes.filter(write => write.group).length;
        await controller.celebrateDonation();
        expect(await controller.requestColor('blue')).toEqual({ status: 'busy' });
        await jest.advanceTimersByTimeAsync(5600);
        expect(writes.filter(write => write.group)).toHaveLength(partyFrames);
        expect(writes.slice(-3)).toEqual([
            { light: '1', payload: { on: true, bri: 80, xy: [0.2, 0.3] } },
            { light: '2', payload: { on: false, bri: 100, hue: 12000, sat: 150 } },
            { light: '3', payload: { on: true, bri: 180, ct: 350 } }
        ]);
        const finished = writes.length;
        await jest.advanceTimersByTimeAsync(20000);
        expect(writes).toHaveLength(finished);
    });

    test('donation drains an in-flight party frame before writing celebration colors', async () => {
        await controller.requestColor('party');
        const pending = deferred();
        api.groups.setGroupState.mockImplementationOnce(() => pending.promise);
        await jest.advanceTimersByTimeAsync(1000);
        const donation = controller.celebrateDonation();
        await jest.advanceTimersByTimeAsync(0);
        expect(writes.filter(write => write.light)).toHaveLength(0);
        pending.resolve();
        await donation;
        await jest.advanceTimersByTimeAsync(5600);
        expect(writes.slice(-3).map(write => write.payload.bri)).toEqual([80, 100, 180]);
    });

    test('donation takes priority while a party snapshot is pending', async () => {
        const pending = deferred();
        api.lights.getLight.mockImplementationOnce(() => pending.promise);
        const party = controller.requestColor('party');
        const donation = controller.celebrateDonation();
        expect(await controller.requestColor('blue')).toEqual({ status: 'busy' });
        pending.resolve(structuredClone(lights[0]));
        expect(await party).toEqual({ status: 'busy' });
        await donation;
        await jest.advanceTimersByTimeAsync(5600);
        expect(writes.filter(write => write.group)).toHaveLength(0);
        expect(writes.slice(-3).map(write => write.payload.bri)).toEqual([80, 100, 180]);
    });

    test('donation waits for party restoration already in progress', async () => {
        await controller.requestColor('party');
        const pending = deferred();
        api.lights.setLightState.mockImplementationOnce(() => pending.promise);
        await jest.advanceTimersByTimeAsync(15000);
        const donation = controller.celebrateDonation();
        await jest.advanceTimersByTimeAsync(0);
        expect(writes.filter(write => write.light)).toHaveLength(0);
        pending.resolve();
        await jest.advanceTimersByTimeAsync(300);
        await donation;
        await jest.advanceTimersByTimeAsync(5600);
        expect(writes.slice(-3).map(write => write.payload.bri)).toEqual([80, 100, 180]);
    });

    test('donation snapshots after an earlier steady write completes', async () => {
        const pending = deferred();
        api.groups.setGroupState.mockImplementationOnce(async () => {
            await pending.promise;
            lights.forEach(light => Object.assign(light.state, { hue: 43690, sat: 254, bri: 254, colormode: 'hs' }));
        });
        const color = controller.requestColor('blue');
        const donation = controller.celebrateDonation();
        await jest.advanceTimersByTimeAsync(0);
        expect(api.lights.getLight).not.toHaveBeenCalled();
        pending.resolve();
        await color;
        await donation;
        await jest.advanceTimersByTimeAsync(5600);
        expect(writes.slice(-3).map(write => write.payload.hue)).toEqual([43690, 43690, 43690]);
    });

    test('restoration still attempts later lights after a bridge failure', async () => {
        await controller.requestColor('party');
        api.lights.setLightState.mockRejectedValueOnce(new Error('offline'));
        await jest.advanceTimersByTimeAsync(15300);
        expect(writes.filter(write => write.light).map(write => write.light)).toEqual(['2', '3']);
        expect(await controller.requestColor('red')).toEqual({ status: 'applied' });
    });

    test('a failing party frame restores lighting and releases ownership', async () => {
        await controller.requestColor('party');
        api.groups.setGroupState.mockRejectedValueOnce(new Error('offline'));
        await jest.advanceTimersByTimeAsync(1300);
        expect(writes.slice(-3).map(write => write.payload.bri)).toEqual([80, 100, 180]);
        expect(await controller.requestColor('red')).toEqual({ status: 'applied' });
    });

    test('stop cancels a party and restores the original snapshot once', async () => {
        await controller.requestColor('party');
        const stop = controller.stop();
        expect(controller.stop()).toBe(stop);
        await jest.advanceTimersByTimeAsync(300);
        await stop;
        expect(writes.filter(write => write.group)).toHaveLength(1);
        expect(writes.filter(write => write.light)).toHaveLength(3);
        expect(await controller.requestColor('red')).toEqual({ status: 'unavailable' });
        await controller.celebrateDonation();
        await jest.advanceTimersByTimeAsync(60000);
        expect(writes).toHaveLength(4);
    });

    test('stop drains an in-flight frame before attempting restoration', async () => {
        await controller.requestColor('party');
        const pending = deferred();
        api.groups.setGroupState.mockImplementationOnce(() => pending.promise);
        await jest.advanceTimersByTimeAsync(1000);
        const stop = controller.stop();
        await jest.advanceTimersByTimeAsync(0);
        expect(writes.filter(write => write.light)).toHaveLength(0);
        pending.resolve();
        await jest.advanceTimersByTimeAsync(300);
        await stop;
        expect(writes.slice(-3).map(write => write.payload.bri)).toEqual([80, 100, 180]);
    });

    test('stop cancels an active donation before restoring lighting', async () => {
        await controller.celebrateDonation();
        const stop = controller.stop();
        await jest.advanceTimersByTimeAsync(300);
        await stop;
        const finished = writes.length;
        await jest.advanceTimersByTimeAsync(10000);
        expect(writes).toHaveLength(finished);
        expect(writes.slice(-3).map(write => write.payload.bri)).toEqual([80, 100, 180]);
    });

    test('shutdown during initialization never enables later effects', async () => {
        await controller.stop();
        const pending = deferred();
        v3.api.createLocal.mockReturnValue({ connect: jest.fn(() => pending.promise) });
        controller = new HueController({ hue: { ipAddress: '192.168.1.2', username: 'key', groupId: '1', chatControlEnabled: true } }, logger);
        const initialize = controller.initialize();
        const stop = controller.stop();
        pending.resolve(api);
        expect(await initialize).toBe(false);
        await stop;
        expect(controller.connected).toBe(false);
        expect(await controller.requestColor('party')).toEqual({ status: 'unavailable' });
    });
});
