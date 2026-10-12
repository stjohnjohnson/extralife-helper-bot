jest.mock('discord.js', () => { throw new Error('Runner imported Discord'); });
jest.mock('tmi.js', () => { throw new Error('Runner imported Twitch'); });
jest.mock('../app.js', () => { throw new Error('Runner imported full bot'); });
jest.mock('../src/streamMarkers.js', () => { throw new Error('Runner imported marker client'); });
const fs = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');
const { createManualClock } = require('./helpers/manualClock');
const { runIntegration } = require('../src/streamAvatars/integration');
const { parseAction } = require('../src/streamAvatars/actions');
const { startWebServer } = require('../src/webServer');
const token = 'integration-test-token';
function companion(address, packets) {
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/sa/socket`);
    socket.on('error', () => {});
    socket.on('open', () => socket.send(JSON.stringify({ version: 3, type: 'auth', token })));
    socket.on('message', raw => {
        const value = JSON.parse(raw); packets.push(value);
        if (value.type === 'snapshot') socket.send(JSON.stringify({ version: 3, type: 'ready', capabilities: ['campaign', 'celebrations', 'donation-recognition'], resolution: { width: 1920, height: 1080 } }));
        if (value.type === 'heartbeat') socket.send(JSON.stringify({ version: 3, type: 'heartbeat' }));
    }); return socket;
}
test.each(['random','jump','hug'])('temporary subsystem runs every fixture with %s without real clients or production state', async recognition => {
    const packets = [], dirs = [], messages = []; let socket; const time = createManualClock(Date.now());
    const hue = { initialize: jest.fn().mockResolvedValue(true), celebrateDonation: jest.fn().mockResolvedValue(), stop: jest.fn().mockResolvedValue() };
    const logger = { warn: jest.fn(), info(message, metadata) { messages.push(message); if (metadata?.address) { dirs.push(metadata.stateDir); socket = companion(metadata.address, packets); } } };
    try {
        const result = await runIntegration({ listenerConfig: { host: '127.0.0.1', port: 0 }, token, logger, recognition, clock: time.clock, timers: time.timers, hueOutput: hue,
            wait: async ms => { await time.advance(ms); await new Promise(resolve => setTimeout(resolve, 2)); } });
        expect(result).toMatchObject({ completedScenarios: ['ordinary','anonymous','batch','milestone','large','goal'], finalTotalCents: 100000 });
        const effects = packets.filter(value => value.type === 'celebration');
        expect(effects.map(value => [value.phase,value.kind])).toEqual([
            ['recognition','donation'],['recognition','donation'],['recognition','donation'],
            ['recognition','donation'],['party','milestone'],['recognition','donation'],['party','milestone'],['recognition','donation'],['party','goal']
        ]);
        expect(effects.filter(value=>value.phase==='party').map(value=>value.campaignTotalCents)).toEqual([250000,355000,100000]);
        expect(messages).toContain('batch: expect $25 FROM 2 DONATIONS - THANK YOU! for 5s; dispatched. Verify visually.');
        const recognitionEffects=effects.filter(value=>value.phase==='recognition');
        expect(recognitionEffects.map(value=>[value.donationCount,value.donationTotalCents])).toEqual([[1,2500],[1,2500],[2,2500],[1,1000],[1,106000],[1,1000]]);
        for(const effect of recognitionEffects)expect(recognition==='random'?['jump','hug']:[recognition]).toContain(effect.recognitionAction);
        expect(packets.filter(value => value.type === 'snapshot').every(value => value.mode === 'integration')).toBe(true);
        expect(hue.celebrateDonation).toHaveBeenCalledTimes(6); expect(hue.stop).toHaveBeenCalledTimes(1);
        for (const dir of dirs) await expect(fs.stat(dir)).rejects.toMatchObject({ code: 'ENOENT' });
        expect(Object.keys(require.cache).some(path => /(?:discord\.js|tmi\.js|streamMarkers\.js|\/app\.js)$/.test(path))).toBe(false);
    } finally { socket?.terminate(); }
});
test('readiness timeout releases the port and stops optional Hue', async () => {
    let now = 10000000, address; const hue = { initialize: jest.fn(), stop: jest.fn().mockResolvedValue() };
    await expect(runIntegration({ listenerConfig: { host: '127.0.0.1', port: 0 }, token, hueOutput: hue, clock: { nowMs: () => now }, wait: async ms => { now+=ms; },
        logger: { warn() {}, info(message, details) { if (details?.address) address=details.address; } } })).rejects.toThrow(/60000|companion.*ready/i);
    const listener = await startWebServer({ config: { host: '127.0.0.1', port: address.port } }); await listener.stop();
    expect(hue.initialize).not.toHaveBeenCalled(); expect(hue.stop).toHaveBeenCalledTimes(1);
});
test.each(['hearts','crowd 20','clear','rehearsal start'])('production rejects removed control %s and points to development runner', action => {
    expect(() => parseAction(action)).toThrow(/sa:integration/);
});
test('port conflict preserves the original listener', async () => {
    const listener = await startWebServer({ config: { host: '127.0.0.1', port: 0 } });
    try { await expect(runIntegration({ listenerConfig: { host: '127.0.0.1', port: listener.address.port }, token })).rejects.toMatchObject({ code: 'EADDRINUSE' }); }
    finally { await listener.stop(); }
});
test.each(['SIGINT','SIGTERM'])('CLI uses only listener/token and %s delivers cleanup without touching production state or Hue', async signal => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'sa-runner-sentinel-')); const sentinel = join(directory, 'sentinel'); await fs.writeFile(sentinel, 'unchanged');
    const reservation = await startWebServer({ config: { host: '127.0.0.1', port: 0 } }); const port = reservation.address.port; await reservation.stop();
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, WEB_HOST: '127.0.0.1', WEB_PORT: String(port), STREAM_AVATARS_TOKEN: token, STREAM_AVATARS_STATE_DIR: directory,
        HUE_USERNAME: 'must-not-connect', HUE_IPADDRESS: 'must-not-connect', HUE_GROUPID: '1' };
    const child = spawn(process.execPath, ['scripts/sa-integration.js','--scenario','ordinary','--crowd','20','--recognition',signal==='SIGINT' ? 'jump' : 'hug'], { env, stdio: ['ignore','pipe','pipe'] });
    let stdout='', stderr='', socket; const packets=[];
    const done = once(child,'exit');
    const ready = new Promise((resolve, reject) => {
        child.stderr.on('data', chunk => { stderr+=chunk; });
        child.stdout.on('data', chunk => {
            stdout+=chunk;
            const match=/listener: [^:]+:(\d+)/.exec(stdout);
            if (match && !socket) {
                socket=companion({ port: Number(match[1]) }, packets);
                socket.on('message', raw => { if (JSON.parse(raw).type==='celebration') resolve(); });
            }
        }); child.once('exit', code => reject(new Error('early exit '+code+' '+stderr)));
    });
    try {
        await ready; child.kill(signal); const [code] = await done;
        expect(code).toBe(signal==='SIGINT' ? 130 : 143); expect(stderr).toBe('');
        expect(packets.find(value => value.type==='celebration')).toMatchObject({ recognitionAction: signal==='SIGINT' ? 'jump' : 'hug', donationTotalCents: 2500 });
        expect(stdout).toContain('$25 - THANK YOU!'); expect(stdout).toContain('ordinary'); expect(packets.slice(packets.findLastIndex(value=>value.type==='celebration')+1).some(value=>value.type==='clear')).toBe(true);
        expect(await fs.readFile(sentinel,'utf8')).toBe('unchanged'); expect(await fs.readdir(directory)).toEqual(['sentinel']);
    } finally { child.kill('SIGTERM'); socket?.terminate(); await fs.rm(directory,{recursive:true,force:true}); }
},10000);

test('runner rejects unknown recognition before creating a listener', async () => {
    const logger = { info: jest.fn(), warn: jest.fn() };
    await expect(runIntegration({ listenerConfig: { host: '127.0.0.1', port: 0 }, token, recognition: 'explode', logger, wait: async () => { throw new Error('listener was created'); } })).rejects.toThrow(/recognition/);
    expect(logger.info).not.toHaveBeenCalled();
});

test.each([
    [{ scenario: 'themes', theme: 'all' }, ['block-world','kitchen','outdoor','puzzle','space-salvage','party','Raft','PEAK','Minecraft Bedrock','neutral']],
    [{ scenario: 'ordinary', theme: 'kitchen' }, ['ordinary']]
])('existing theme previews run over the new real socket runner: %j', async (options, completed) => {
    const packets = [], dirs = []; let socket; const time = createManualClock(Date.now());
    const logger = { warn: jest.fn(), info(message, details) {
        if (!details?.address) return;
        dirs.push(details.stateDir);
        socket = new WebSocket(`ws://127.0.0.1:${details.address.port}/sa/socket`);
        socket.on('open', () => socket.send(JSON.stringify({ version: 3, type: 'auth', token })));
        socket.on('message', raw => {
            const value = JSON.parse(raw); packets.push(value);
            if (value.type === 'snapshot') socket.send(JSON.stringify({ version: 3, type: 'ready', capabilities: ['campaign','celebrations','donation-recognition','themes'], resolution: { width: 1920, height: 1080 } }));
        });
    } };
    try {
        const result = await runIntegration({ listenerConfig: { host: '127.0.0.1', port: 0 }, token, logger, clock: time.clock, timers: time.timers, ...options,
            wait: async ms => { await time.advance(ms); await new Promise(resolve => setTimeout(resolve, 2)); } });
        expect(result.completedScenarios).toEqual(completed);
        const entrances = packets.filter(value => value.type === 'game-entrance');
        expect(entrances.length).toBe(options.scenario === 'themes' ? 10 : 1);
        expect(entrances.every(value => value.version === 3 && value.mode === 'integration' && value.campaignId === 'integration')).toBe(true);
        if (options.scenario === 'ordinary') {
            const entranceAt = packets.findIndex(value => value.type === 'game-entrance');
            const giftAt = packets.findIndex(value => value.type === 'celebration');
            expect(packets.slice(entranceAt, giftAt).some(value => value.type === 'clear')).toBe(false);
            expect(packets.some(value => value.type === 'celebration' && value.donationTotalCents === 2500)).toBe(true);
            expect(packets.filter(value => value.type === 'snapshot' && value.theme).every(value => value.theme.themeId === 'kitchen')).toBe(true);
        } else expect(packets.filter(value => value.type === 'snapshot' && value.theme).at(-1).theme.themeId).toBeNull();
        for (const dir of dirs) await expect(fs.stat(dir)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { socket?.terminate(); }
});
