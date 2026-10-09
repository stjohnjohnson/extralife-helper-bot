const readline = require('node:readline');
const { parseWebServerConfiguration } = require('../src/webServerConfig');
const { parseStreamAvatarsConfiguration } = require('../src/streamAvatars/config');
const { startStreamAvatars } = require('../src/streamAvatars');
const { parseAction } = require('../src/streamAvatars/rehearsal');
async function run() {
    require('dotenv').config({ quiet: true });
    const webServer = parseWebServerConfiguration(process.env);
    const settings = parseStreamAvatarsConfiguration({ ...process.env, STREAM_AVATARS_ENABLED: 'true' });
    if (!settings.enabled) throw new Error(settings.errors.join('; '));
    const service = await startStreamAvatars({ config: { webServer, twitch: { channel: process.env.TWITCH_CHANNEL || 'local-rehearsal' }, streamAvatars: settings },
        logger: { warn: message => console.error(message) }, standalone: true });
    let lines;
    const shutdown = () => { lines?.close(); void service.stop(); };
    process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
    try {
        console.log((await service.dispatch(parseAction('rehearsal start'))).message);
        lines = readline.createInterface({ input: process.stdin });
        console.log('Local rehearsal uses the real LAN bridge. Type status, crowd 20, hearts, clear, or quit.');
        for await (const line of lines) {
            if (line.trim().toLowerCase() === 'quit') break;
            try { console.log((await service.dispatch(parseAction(line))).message); } catch { console.log('Invalid rehearsal command.'); }
        }
    } finally { lines?.close(); process.removeListener('SIGINT', shutdown); process.removeListener('SIGTERM', shutdown); await service.stop(); }
}
if (require.main === module) run().catch(() => { console.error('Unable to start local rehearsal. Check the bridge token and listener address/port.'); process.exitCode = 1; });
module.exports = { run };
