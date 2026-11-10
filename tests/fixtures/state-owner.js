const { createCampaignStore } = require('../../src/streamAvatars/campaignStore');
const { createSessionStore } = require('../../src/gameSession/store');
const [kind, path] = process.argv.slice(2);
const store = kind === 'campaign' ? createCampaignStore({ path, mode: 'production', participantId: '12' }) : createSessionStore({ path, mode: 'production', channel: 'streamer' });
(async () => {
    try { await store.load(); process.send({ ready: true }); }
    catch (error) { process.send({ error: error.code || error.message }); await store.close(); process.disconnect(); return; }
    const keepAlive = setInterval(() => {}, 1000);
    process.on('message', async () => { clearInterval(keepAlive); await store.close(); process.disconnect(); });
})();
