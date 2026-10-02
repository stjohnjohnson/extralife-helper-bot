const EVENT_TYPES = new Set([
    'donation',
    'chat_message',
    'game_change',
    'viewer_sample',
    'voice_sample',
    'command',
    'service_error'
]);

function eventMetadata(eventType, payload = {}) {
    if (!EVENT_TYPES.has(eventType)) {
        throw new Error(`Unsupported analysis event type: ${eventType}`);
    }
    return { ...payload, eventVersion: 1, eventType };
}

module.exports = { eventMetadata };
