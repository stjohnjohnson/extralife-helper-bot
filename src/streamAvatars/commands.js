const { isAdmin } = require('../config');
const { parseAction } = require('./actions');
const seen = new Map();
const normalizeChannel = channel => typeof channel === 'string' ? channel.replace(/^#/, '').toLowerCase() : '';
async function handleStreamAvatarsCommand(input, context, { config, service, logger, nowMs = Date.now }) {
    const login = context.tags?.username;
    if (typeof login !== 'string' || !isAdmin('twitch', login, config)) return 'You do not have permission to use this command.';
    if (normalizeChannel(context.channel) !== normalizeChannel(config.twitch.channel) ||
        (context.tags['source-room-id'] && context.tags['source-room-id'] !== context.tags['room-id'])) return 'Use Stream Avatars controls in the configured Twitch channel.';
    const now = nowMs(); const sentAt = Number(context.tags['tmi-sent-ts']); const id = context.tags.id;
    if (typeof id !== 'string' || !id || id.length > 128 || !Number.isFinite(sentAt) || now - sentAt > 60000 || sentAt - now > 5000) return 'Command expired or missing message identity; please send it again.';
    for (const [key, time] of seen) if (now - time >= 300000) seen.delete(key);
    const key = normalizeChannel(context.channel) + ':' + id;
    if (seen.has(key)) return null;
    seen.set(key, now); if (seen.size > 256) seen.delete(seen.keys().next().value);
    if (!service) return 'Stream Avatars is disabled or unavailable.';
    let action;
    try { action = parseAction(input); } catch (error) { return error.message; }
    if (action.name === 'status') {
        const status = service.getStatus();
        return `Stream Avatars ${status.mode}: ${status.crowdCount} avatars, ${Math.floor(status.elapsedMs / 3600000)}h elapsed, $${((status.knownLiveTotalCents ?? 0) / 100).toFixed(2)} raised this stream, companion ${status.companionConnected ? 'connected' : 'disconnected'}${status.recoveryRequired ? ', recovery required' : ''}${status.reconciliationRequired ? ', reconciling donations' : ''}${status.unknownAmountCount ? ', hidden amounts: ' + status.unknownAmountCount : ''}.`;
    }
    try {
        const result = await service.dispatch(action, { platform: 'twitch', login, messageId: id });
        logger.info('Stream Avatars admin command', { action: action.name, status: result.status });
        return result.message;
    } catch { return 'Stream Avatars command failed; check companion and state recovery.'; }
}
module.exports = { handleStreamAvatarsCommand };
