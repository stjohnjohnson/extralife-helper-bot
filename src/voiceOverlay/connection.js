const { joinVoiceChannel, entersState, VoiceConnectionStatus, VoiceConnectionDisconnectReason } = require('@discordjs/voice');

function startOverlayConnection({ client, channel, state, logger, streamerUserId }) {
    let active = true;
    let paused = false;
    let deafened = false;
    let guildUnavailable = channel.guild.available === false;
    const streamerInRoom = guild => (guild.voiceStates?.cache || channel.guild.voiceStates.cache).get(streamerUserId)?.channelId === channel.id;
    let streamerPresent = streamerInRoom(channel.guild);
    let expectedDeparture = false;
    let connection;
    let retryTimer;
    let recoveryTimer;
    let attempts = 0;
    let waitController;
    let waitTimer;
    const canConnect = () => active && !paused && streamerPresent && !guildUnavailable;
    function available() {
        state.setReady(canConnect() && !deafened && connection?.state.status === VoiceConnectionStatus.Ready);
    }
    function cancelWait() {
        const controller = waitController;
        waitController = undefined;
        controller?.abort(); clearTimeout(waitTimer);
    }
    async function waitForReady() {
        cancelWait();
        const waitingConnection = connection;
        const controller = new AbortController();
        waitController = controller;
        const timer = setTimeout(() => controller.abort(), 20000);
        waitTimer = timer;
        try {
            await entersState(waitingConnection, VoiceConnectionStatus.Ready, controller.signal);
        } catch (error) {
            if (waitController !== controller || connection !== waitingConnection || !canConnect()) return;
            throw error;
        } finally {
            clearTimeout(timer);
        }
        if (waitController !== controller || connection !== waitingConnection || !canConnect()) return;
        waitController = undefined;
        attempts = 0;
        clearTimeout(retryTimer); retryTimer = null;
        available();
    }
    function retry() {
        if (!canConnect() || retryTimer) return;
        clearTimeout(recoveryTimer); recoveryTimer = null;
        state.setReady(false);
        const delay = Math.min(1000 * 2 ** Math.min(attempts++, 5), 30000);
        retryTimer = setTimeout(async () => {
            retryTimer = null;
            if (!canConnect()) return;
            try {
                if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) replaceConnection();
                else if (!connection.rejoin({ channelId: channel.id, selfMute: true, selfDeaf: false })) throw new Error('Voice adapter unavailable');
                await waitForReady();
            } catch { retry(); }
        }, delay);
    }
    function releaseConnection() {
        cancelWait();
        clearTimeout(retryTimer); retryTimer = null;
        clearTimeout(recoveryTimer); recoveryTimer = null;
        state.setReady(false);
        detachConnection();
        const previous = connection;
        connection = undefined;
        if (previous && previous.state.status !== VoiceConnectionStatus.Destroyed) {
            // The gateway may confirm our deliberate departure after a new join starts.
            expectedDeparture = channel.guild.voiceStates.cache.get(client.user.id)?.channelId === channel.id;
            previous.destroy();
        }
        deafened = false;
        attempts = 0;
    }
    function pause() {
        paused = true;
        releaseConnection();
        logger.warn('Voice overlay disconnected or moved; restart to reconnect');
    }
    const onChange = (oldState, next) => {
        if (!canConnect()) return;
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
    const onError = () => { if (canConnect()) { logger.warn('Voice overlay transport failed; reconnecting'); retry(); } };
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
    function joinWhenPresent() {
        if (!canConnect() || connection) return;
        try { replaceConnection(); void waitForReady().catch(() => retry()); }
        catch { logger.warn('Unable to join voice overlay; reconnecting'); retry(); }
    }
    const onVoice = (oldState, next) => {
        if (!active || next.guild?.id !== channel.guild.id) return;
        if (next.id === streamerUserId) {
            streamerPresent = next.channelId === channel.id;
            if (!streamerPresent) releaseConnection();
            else joinWhenPresent();
            return;
        }
        if (next.id !== client.user.id || paused) return;
        if (expectedDeparture && oldState.channelId === channel.id && next.channelId === null) {
            expectedDeparture = false;
            return;
        }
        if (!connection) return;
        if (oldState.channelId === channel.id && next.channelId !== channel.id) { pause(); return; }
        if (next.channelId === channel.id) { expectedDeparture = false; deafened = Boolean(next.serverDeaf || next.selfDeaf); available(); }
    };
    const onUnavailable = guild => {
        if (!active || guild.id !== channel.guild.id) return;
        guildUnavailable = true;
        cancelWait();
        clearTimeout(retryTimer); retryTimer = null;
        clearTimeout(recoveryTimer); recoveryTimer = null;
        state.setReady(false);
    };
    const onAvailable = guild => {
        if (!active || paused || guild.id !== channel.guild.id) return;
        guildUnavailable = false;
        streamerPresent = streamerInRoom(guild);
        if (!streamerPresent) releaseConnection();
        else if (!connection) joinWhenPresent();
        else if (connection.state.status === VoiceConnectionStatus.Ready) available();
        else retry();
    };
    client.on('voiceStateUpdate', onVoice);
    client.on('guildUnavailable', onUnavailable);
    client.on('guildAvailable', onAvailable);
    function stop() {
        if (!active) return;
        active = false;
        client.removeListener('voiceStateUpdate', onVoice);
        client.removeListener('guildUnavailable', onUnavailable);
        client.removeListener('guildAvailable', onAvailable);
        releaseConnection();
    }
    let ready = Promise.resolve();
    try {
        if (canConnect()) {
            replaceConnection();
            ready = waitForReady().catch(error => { stop(); throw error; });
        }
    } catch (error) { stop(); throw error; }
    return { ready, async stop() { stop(); } };
}
module.exports = { startOverlayConnection };
