const { parseWebServerConfiguration } = require('../src/webServerConfig');
const { runIntegration } = require('../src/streamAvatars/integration');
async function run(args = process.argv.slice(2), env = process.env) {
    require('dotenv').config({ quiet: true });
    let scenario = 'all', crowdCount = 20, hue = false;
    for (let i=0;i<args.length;i++) {
        if (args[i]==='--scenario' && args[i+1]) scenario=args[++i];
        else if (args[i]==='--crowd' && /^\d+$/.test(args[i+1] || '')) crowdCount=Number(args[++i]);
        else if (args[i]==='--hue') hue=true;
        else throw new Error('Use --scenario ordinary|anonymous|batch|milestone|large|goal|all, --crowd 0..100, or --hue.');
    }
    const listenerConfig = parseWebServerConfiguration(env);
    if (listenerConfig.errors.length) throw new Error(listenerConfig.errors.join('; '));
    let hueOutput;
    if (hue) {
        if (!env.HUE_USERNAME?.trim() || !env.HUE_IPADDRESS?.trim() || !/^\d+$/.test(env.HUE_GROUPID || '') || !Number.isSafeInteger(Number(env.HUE_GROUPID))) throw new Error('--hue requires HUE_USERNAME, HUE_IPADDRESS and an integer HUE_GROUPID');
        const { HueController } = require('../src/hueControl');
        hueOutput = new HueController({ hue: { username: env.HUE_USERNAME, ipAddress: env.HUE_IPADDRESS, groupId: env.HUE_GROUPID, chatControlEnabled: false } }, console);
    }
    const controller = new AbortController();
    const shutdown = signal => { process.exitCode=signal==='SIGINT' ? 130 : 143; controller.abort(); };
    process.once('SIGINT',shutdown); process.once('SIGTERM',shutdown);
    try { return await runIntegration({ listenerConfig, token: env.STREAM_AVATARS_TOKEN, crowdCount, scenario, signal: controller.signal, hueOutput }); }
    catch (error) { if (!controller.signal.aborted) throw error; }
    finally { process.removeListener('SIGINT',shutdown); process.removeListener('SIGTERM',shutdown); }
}
if (require.main === module) run().catch(error => { console.error('Integration run failed: ' + (error.code === 'EADDRINUSE' ? 'listener port is already in use; stop production or choose WEB_PORT.' : error.message)); process.exitCode=1; });
module.exports = { run };
