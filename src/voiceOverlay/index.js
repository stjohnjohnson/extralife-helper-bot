const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { createOverlayState } = require('./state');
const { startOverlayConnection } = require('./connection');
const { startOverlayServer } = require('./server');

async function startVoiceOverlay({ client, config, logger, signal }) {
    if (!config.voiceOverlay?.enabled) return { async stop() {} };
    const checkAbort = () => { if (signal?.aborted) throw new Error('Voice overlay startup aborted'); };
    checkAbort();
    const channel = await client.channels.fetch(config.discord.liveRoomChannel);
    checkAbort();
    if (!channel?.isVoiceBased() || channel.type === ChannelType.GuildStageVoice) throw new Error('Voice overlay requires a regular live voice channel');
    const permissions = channel.permissionsFor(client.user);
    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) {
        throw new Error('Voice overlay requires View Channel and Connect permissions in the live room');
    }
    const state = createOverlayState({ client, channel, excludedUserId: config.gameUpdates.userId });
    let server;
    let connection;
    let stopping;
    const stop = () => {
        if (!stopping) stopping = (async () => {
            signal?.removeEventListener('abort', onAbort);
            await connection?.stop();
            state.stop();
            await server?.stop();
        })();
        return stopping;
    };
    const onAbort = () => { void stop().catch(() => logger.error('Unable to close voice overlay')); };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
        server = await startOverlayServer({ config: config.voiceOverlay, state, logger });
        // If shutdown raced the listen operation, explicitly close this late server.
        if (signal?.aborted) { await server.stop(); checkAbort(); }
        connection = startOverlayConnection({ client, channel, state, logger, streamerUserId: config.gameUpdates.userId });
        await connection.ready;
        checkAbort();
        logger.info(`Voice overlay ready on port ${server.address.port} at /voice`);
        return { stop };
    } catch (error) { await stop(); throw error; }
}
module.exports = { startVoiceOverlay };
