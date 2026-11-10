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
    if (typeof id !== 'string' || !id || id.length > 128 || !Number.isFinite(sentAt) || now - sentAt > 60000 || sentAt - now > 5000) return 'I couldn’t verify that command. Please send it again.';
    for (const [key, time] of seen) if (now - time >= 300000) seen.delete(key);
    const key = normalizeChannel(context.channel) + ':' + id;
    if (seen.has(key)) return null;
    seen.set(key, now); if (seen.size > 256) seen.delete(seen.keys().next().value);
    if (!service) return 'Stream Avatars is disabled or unavailable.';
    let action;
    try { action = parseAction(input); } catch (error) { return error.message; }
    if (action.name === 'status') {
        const status = service.getStatus();
        const money = cents => {
            if (!Number.isSafeInteger(cents) || cents < 0) return null;
            const value = BigInt(cents), fraction = value % 100n;
            return '$' + (value / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? '.' + fraction.toString().padStart(2, '0') : '');
        };
        const total = money(status.campaignTotalCents);
        const goal = money(status.campaignGoalCents);
        const milestone = money(status.nextMilestoneCents);
        const campaign = total !== null && goal !== null ? `We’ve raised ${total} toward our ${goal} goal.`
            : total !== null ? `We’ve raised ${total}. We’re waiting for the campaign goal.`
                : goal !== null ? `We’re waiting for the campaign total. Our goal is ${goal}.`
                    : 'We’re waiting for the campaign total and goal.';
        return [
            status.mode === 'integration' ? 'Test mode.' : null,
            `${status.crowdCount} ${status.crowdCount === 1 ? 'avatar' : 'avatars'} hanging out!`,
            campaign,
            milestone !== null ? `Next milestone: ${milestone}.` : 'We’re waiting for the next milestone.',
            `Stream Avatars is ${status.companionConnected ? 'connected' : 'disconnected'}.`,
            status.recoveryRequired ? 'The campaign needs recovery. Use !sa campaign recover confirm.' : null,
            status.gameRecoveryRequired ? 'The game needs recovery. Use !sa game recover confirm while the stream is offline.' : null,
            status.reconciliationRequired ? 'I’m checking the latest donation totals before resuming effects.' : null
        ].filter(Boolean).join(' ');

    }
    try {
        const result = await service.dispatch(action, { platform: 'twitch', login, messageId: id });
        logger.info('Stream Avatars admin command', { action: action.name, status: result.status });
        return result.message;
    } catch { return 'That didn’t work. Check the Stream Avatars connection and run !sa status for recovery details.'; }
}
module.exports = { handleStreamAvatarsCommand };
