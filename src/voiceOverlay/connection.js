const { joinVoiceChannel, entersState, VoiceConnectionStatus, VoiceConnectionDisconnectReason } = require('@discordjs/voice');

function startOverlayConnection({ client, channel, state, logger }) {
    let active = true;
    let paused = false;
    let deafened = false;
    let retryTimer;
    let attempts = 0;
    let waitController;
    let waitTimer;
    const connection = joinVoiceChannel({ channelId: channel.id, guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator, selfMute: true, selfDeaf: false });
    function available() {
        state.setReady(active && !paused && !deafened && connection.state.status === VoiceConnectionStatus.Ready);
    }
    function cancelWait() { waitController?.abort(); clearTimeout(waitTimer); }
    async function waitForReady() {
        cancelWait();
        const controller = new AbortController();
        waitController = controller;
        waitTimer = setTimeout(() => controller.abort(), 20000);
        try { await entersState(connection, VoiceConnectionStatus.Ready, controller.signal); }
        finally { clearTimeout(waitTimer); }
        if (!active || paused) throw new Error('Voice overlay connection stopped');
        attempts = 0;
        clearTimeout(retryTimer);
        retryTimer = null;
        available();
    }
    function retry() {
        if (!active || paused || retryTimer) return;
        state.setReady(false);
        const delay = Math.min(1000 * 2 ** Math.min(attempts++, 5), 30000);
        retryTimer = setTimeout(async () => {
            retryTimer = null;
            if (!active || paused) return;
            try {
                if (!connection.rejoin({ channelId: channel.id, selfMute: true, selfDeaf: false })) throw new Error('Voice adapter unavailable');
                await waitForReady();
            } catch { retry(); }
        }, delay);
    }
    function pause() {
        paused = true;
        cancelWait();
        clearTimeout(retryTimer);
        retryTimer = null;
        state.setReady(false);
        logger.warn('Voice overlay disconnected or moved; restart to reconnect');
        if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
    }
    const onChange = (oldState, next) => {
        if (!active || paused) return;
        if (next.status === VoiceConnectionStatus.Ready) {
            attempts = 0; clearTimeout(retryTimer); retryTimer = null; available();
        } else {
            state.setReady(false);
            if (next.status === VoiceConnectionStatus.Disconnected) {
                if (next.reason === VoiceConnectionDisconnectReason.Manual || next.closeCode === 4014) pause();
                else retry();
            }
        }
    };
    const onError = () => { if (active && !paused) { logger.warn('Voice overlay transport failed; reconnecting'); retry(); } };
    const onStart = id => state.setSpeaking(id, true);
    const onEnd = id => state.setSpeaking(id, false);
    const onVoice = (oldState, next) => {
        if (!active || paused || next.id !== client.user.id || next.guild?.id !== channel.guild.id) return;
        if (oldState.channelId === channel.id && next.channelId !== channel.id) { pause(); return; }
        if (next.channelId === channel.id) { deafened = Boolean(next.serverDeaf || next.selfDeaf); available(); }
    };
    connection.on('stateChange', onChange);
    connection.on('error', onError);
    connection.receiver.speaking.on('start', onStart);
    connection.receiver.speaking.on('end', onEnd);
    client.on('voiceStateUpdate', onVoice);
    function stop() {
        if (!active) return;
        active = false;
        cancelWait(); clearTimeout(retryTimer);
        state.setReady(false);
        client.removeListener('voiceStateUpdate', onVoice);
        connection.removeListener('stateChange', onChange);
        connection.removeListener('error', onError);
        connection.receiver.speaking.removeListener('start', onStart);
        connection.receiver.speaking.removeListener('end', onEnd);
        if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
    }
    const ready = waitForReady().catch(error => { stop(); throw error; });
    return { ready, async stop() { stop(); } };
}
module.exports = { startOverlayConnection };
