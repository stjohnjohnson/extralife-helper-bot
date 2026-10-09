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
const { runIntegration } = require('../src/streamAvatars/integration');
const { parseAction } = require('../src/streamAvatars/actions');
const { startWebServer } = require('../src/webServer');
const token = 'integration-test-token';
function companion(address, packets) {
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/sa/socket`);
    socket.on('error', () => {});
    socket.on('open', () => socket.send(JSON.stringify({ version: 2, type: 'auth', token })));
    socket.on('message', raw => {
        const value = JSON.parse(raw); packets.push(value);
        if (value.type === 'snapshot') socket.send(JSON.stringify({ version: 2, type: 'ready', capabilities: ['celebrations'], resolution: { width: 1920, height: 1080 } }));
        if (value.type === 'heartbeat') socket.send(JSON.stringify({ version: 2, type: 'heartbeat' }));
    }); return socket;
}
test('temporary subsystem runs every fixture without real clients or production state', async () => {
    const packets = [], dirs = []; let socket, now = Date.now();
    const hue = { initialize: jest.fn().mockResolvedValue(true), celebrateDonation: jest.fn().mockResolvedValue(), stop: jest.fn().mockResolvedValue() };
    const logger = { warn: jest.fn(), info(message, metadata) { if (metadata?.address) { dirs.push(metadata.stateDir); socket = companion(metadata.address, packets); } } };
    try {
        const result = await runIntegration({ listenerConfig: { host: '127.0.0.1', port: 0 }, token, logger, clock: { nowMs: () => now }, hueOutput: hue,
            wait: async ms => { now+=ms; await new Promise(resolve => setTimeout(resolve, 2)); } });
        expect(result).toMatchObject({ completedScenarios: ['ordinary','anonymous','batch','milestone','large','goal'], finalTotalCents: 10000 });
        expect(packets.filter(value => value.type === 'celebration').map(value => [value.kind,value.liveTotalCents])).toEqual([
            ['donation',2500],['donation',2500],['donation',2500],['milestone',50000],['milestone',155000],['goal',10000]
        ]);
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
    const child = spawn(process.execPath, ['scripts/sa-integration.js','--scenario','ordinary','--crowd','20'], { env, stdio: ['ignore','pipe','pipe'] });
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
        expect(stdout).toContain('ordinary'); expect(packets.some(value => value.type==='clear')).toBe(true);
        expect(await fs.readFile(sentinel,'utf8')).toBe('unchanged'); expect(await fs.readdir(directory)).toEqual(['sentinel']);
    } finally { child.kill('SIGTERM'); socket?.terminate(); await fs.rm(directory,{recursive:true,force:true}); }
},10000);
