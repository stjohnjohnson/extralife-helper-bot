const { joinVoiceChannel, entersState, VoiceConnectionStatus, VoiceConnectionDisconnectReason } = require('@discordjs/voice');

function startOverlayConnection({ client, channel, state, logger }) {
    let active = true;
    let paused = false;
    let deafened = false;
    let guildUnavailable = channel.guild.available === false;
    let connection;
    let retryTimer;
    let recoveryTimer;
    let attempts = 0;
    let waitController;
    let waitTimer;
    function available() {
        state.setReady(active && !paused && !deafened && !guildUnavailable && connection.state.status === VoiceConnectionStatus.Ready);
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
        if (!active || paused || guildUnavailable || retryTimer) return;
        clearTimeout(recoveryTimer); recoveryTimer = null;
        state.setReady(false);
        const delay = Math.min(1000 * 2 ** Math.min(attempts++, 5), 30000);
        retryTimer = setTimeout(async () => {
            retryTimer = null;
            if (!active || paused || guildUnavailable) return;
            try {
                if (connection.state.status === VoiceConnectionStatus.Destroyed) replaceConnection();
                else if (!connection.rejoin({ channelId: channel.id, selfMute: true, selfDeaf: false })) throw new Error('Voice adapter unavailable');
                await waitForReady();
            } catch { retry(); }
        }, delay);
    }
    function pause() {
        paused = true;
        cancelWait(); clearTimeout(recoveryTimer);
        clearTimeout(retryTimer);
        retryTimer = null;
        state.setReady(false);
        logger.warn('Voice overlay disconnected or moved; restart to reconnect');
        if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
    }
    const onChange = (oldState, next) => {
        if (!active || paused) return;
        if (next.status === VoiceConnectionStatus.Ready) {
            attempts = 0; clearTimeout(retryTimer); retryTimer = null;
            clearTimeout(recoveryTimer); recoveryTimer = null; available();
        } else {
            state.setReady(false);
            if (next.status === VoiceConnectionStatus.Disconnected) {
                if (next.reason === VoiceConnectionDisconnectReason.Manual || next.closeCode === 4014) pause();
                else retry();
            } else if (next.status === VoiceConnectionStatus.Destroyed) retry();
            else if (!recoveryTimer) recoveryTimer = setTimeout(() => { recoveryTimer = null; retry(); }, 20000);
        }
    };
    const onError = () => { if (active && !paused) { logger.warn('Voice overlay transport failed; reconnecting'); retry(); } };
    const onStart = id => state.setSpeaking(id, true);
    const onEnd = id => state.setSpeaking(id, false);
    function detachConnection() {
        connection?.removeListener('stateChange', onChange);
        connection?.removeListener('error', onError);
        connection?.receiver.speaking.removeListener('start', onStart);
        connection?.receiver.speaking.removeListener('end', onEnd);
    }
    function replaceConnection() {
        detachConnection();
        connection = joinVoiceChannel({ channelId: channel.id, guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator, selfMute: true, selfDeaf: false });
        connection.on('stateChange', onChange);
        connection.on('error', onError);
        connection.receiver.speaking.on('start', onStart);
        connection.receiver.speaking.on('end', onEnd);
    }
    const onVoice = (oldState, next) => {
        if (!active || paused || next.id !== client.user.id || next.guild?.id !== channel.guild.id) return;
        if (oldState.channelId === channel.id && next.channelId !== channel.id) { pause(); return; }
        if (next.channelId === channel.id) { deafened = Boolean(next.serverDeaf || next.selfDeaf); available(); }
    };
    const onUnavailable = guild => {
        if (!active || guild.id !== channel.guild.id) return;
        guildUnavailable = true;
        clearTimeout(retryTimer); retryTimer = null;
        clearTimeout(recoveryTimer); recoveryTimer = null;
        state.setReady(false);
    };
    const onAvailable = guild => {
        if (!active || paused || guild.id !== channel.guild.id) return;
        guildUnavailable = false;
        if (connection.state.status === VoiceConnectionStatus.Ready) available();
        else retry();
    };
    replaceConnection();
    client.on('voiceStateUpdate', onVoice);
    client.on('guildUnavailable', onUnavailable);
    client.on('guildAvailable', onAvailable);
    function stop() {
        if (!active) return;
        active = false;
        cancelWait(); clearTimeout(retryTimer); clearTimeout(recoveryTimer);
        state.setReady(false);
        client.removeListener('voiceStateUpdate', onVoice);
        client.removeListener('guildUnavailable', onUnavailable);
        client.removeListener('guildAvailable', onAvailable);
        detachConnection();
        if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
    }
    const ready = waitForReady().catch(error => { stop(); throw error; });
    return { ready, async stop() { stop(); } };
}
module.exports = { startOverlayConnection };
