const readline = require('node:readline');
const { parseStreamAvatarsConfiguration } = require('../src/streamAvatars/config');
const { startStreamAvatars } = require('../src/streamAvatars');
const { parseAction } = require('../src/streamAvatars/rehearsal');
async function run() {
    require('dotenv').config({ quiet: true });
    const settings = parseStreamAvatarsConfiguration({ ...process.env, STREAM_AVATARS_ENABLED: 'true' });
    if (!settings.enabled) throw new Error(settings.errors.join('; '));
    let hue = null;
    if (process.env.SA_REHEARSAL_HUE_ENABLED === 'true') {
        if (!process.env.HUE_USERNAME || !process.env.HUE_IPADDRESS || !process.env.HUE_GROUPID) throw new Error('Explicit Hue rehearsal requires valid Hue settings');
        const { HueController } = require('../src/hueControl');
        hue = new HueController({ hue: { username: process.env.HUE_USERNAME, ipAddress: process.env.HUE_IPADDRESS, groupId: process.env.HUE_GROUPID } }, { info() {}, warn() {}, error() {} });
        if (!await hue.initialize()) throw new Error('Hue initialization failed');
    }
    const service = await startStreamAvatars({ config: { twitch: { channel: process.env.TWITCH_CHANNEL || 'local-rehearsal' }, streamAvatars: settings },
        logger: { warn: message => console.error(message) }, standalone: true, hue });
    let lines;
    const shutdown = () => { lines?.close(); void service.stop(); };
    process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
    try {
        console.log((await service.dispatch(parseAction('rehearsal start'))).message);
        if (hue) await service.dispatch(parseAction('hue on'));
        lines = readline.createInterface({ input: process.stdin });
        console.log('Local rehearsal uses the real LAN bridge. Type status, crowd 20, hearts, clock advance 1h, scenario reconnect, or quit.');
        for await (const line of lines) {
            if (line.trim().toLowerCase() === 'quit') break;
            try { console.log((await service.dispatch(parseAction(line))).message); } catch { console.log('Invalid rehearsal command.'); }
        }
    } finally { lines?.close(); process.removeListener('SIGINT', shutdown); process.removeListener('SIGTERM', shutdown); await service.stop(); await hue?.stop(); }
}
if (require.main === module) run().catch(() => { console.error('Unable to start local rehearsal. Check bridge configuration and persistent storage.'); process.exitCode = 1; });
module.exports = { run };
