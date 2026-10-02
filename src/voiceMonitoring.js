const { eventMetadata } = require('./analysis/eventMetadata');

function startVoiceMonitoring(client, guild, config, logger) {
    const userId = config.gameUpdates.userId;
    const intervalSeconds = config.discord.voiceSampleIntervalSeconds || 60;
    const monitor = { active: true, timer: null, last: null, pending: null };
    function collect(trigger) {
        if (!monitor.active) return;
        try {
            if (!guild || guild.available === false) throw new Error('Voice guild unavailable');
            const state = guild.voiceStates.cache.get(userId);
            const channelId = state?.channelId || null;
            let humanCount = 0;
            let botCount = 0;
            if (channelId) {
                const channel = guild.channels.cache.get(channelId);
                if (!channel?.members || !channel.members.has(userId)) throw new Error('Voice channel unavailable');
                for (const member of channel.members.values()) {
                    if (!member.user || typeof member.user.bot !== 'boolean') throw new Error('Voice member classification unavailable');
                    if (member.user.bot) botCount++;
                    else humanCount++;
                }
                if (channel.members.get(userId).user.bot) throw new Error('Voice anchor must be human');
            }
            const payload = { guildId: guild.id, channelId, streamerPresent: Boolean(channelId), humanCount,
                companionCount: channelId ? humanCount - 1 : 0, botCount, intervalSeconds };
            const key = JSON.stringify(payload);
            if (trigger === 'change' && monitor.last === key) return;
            monitor.last = key;
            const timestamp = new Date().toISOString();
            if (monitor.pending && monitor.pending.timestamp === timestamp && monitor.pending.key === key) {
                if (trigger === 'periodic') monitor.pending.payload.trigger = 'periodic';
                return;
            }
            // Coalesce synchronous collection sources before serializing the event.
            const event = eventMetadata('voice_sample', { ...payload, trigger, timestamp });
            const pending = { timestamp, key, payload: event };
            monitor.pending = pending;
            void Promise.resolve().then(() => {
                if (monitor.active) logger.info('Discord voice participation', pending.payload);
                if (monitor.pending === pending) monitor.pending = null;
            });
        } catch {
            logger.error('Unable to collect Discord voice participation', eventMetadata('service_error', {
                service: 'discord_voice', error: 'Voice state unavailable', intervalSeconds
            }));
        }
    }
    const listener = (oldState, newState) => {
        if (oldState.guild?.id !== guild?.id && newState.guild?.id !== guild?.id) return;
        const current = guild.voiceStates.cache.get(userId)?.channelId;
        if (oldState.id === userId || newState.id === userId ||
            oldState.channelId === current || newState.channelId === current) collect('change');
    };
    client.on('voiceStateUpdate', listener);
    monitor.removeListener = () => client.removeListener('voiceStateUpdate', listener);
    collect('startup');
    monitor.timer = setInterval(() => collect('periodic'), intervalSeconds * 1000);
    return monitor;
}

function stopVoiceMonitoring(monitor) {
    if (!monitor) return;
    monitor.active = false;
    clearInterval(monitor.timer);
    monitor.removeListener();
}

module.exports = { startVoiceMonitoring, stopVoiceMonitoring };
