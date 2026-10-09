/**
 * Twitch viewer count monitoring module
 * Handles periodic logging of stream viewer counts and status
 */

const { makeTwitchApiRequest, getValidAccessToken } = require('./gameUpdates.js');
const { eventMetadata } = require('./analysis/eventMetadata.js');
const { validObservation } = require('./broadcastSession/state');

/**
 * Gets current stream information including viewer count
 * @param {string} channelName - Twitch channel name
 * @param {string} clientId - Twitch client ID
 * @param {string} accessToken - OAuth access token
 * @returns {Promise<Object|null>} Stream data or null if offline
 */
async function getStreamInfo(channelName, clientId, accessToken, signal) {
    const response = await makeTwitchApiRequest(`/streams?user_login=${channelName}`, signal ? { signal } : {}, clientId, accessToken);

    if (!Array.isArray(response?.data)) throw new Error('Invalid Twitch stream response');
    if (response.data.length === 0) {
        return null; // Stream is offline
    }

    return response.data[0]; // Returns stream object with viewer_count, game_name, title, etc.
}

/**
 * Logs current viewer count and stream information
 * @param {Object} config - Configuration object
 * @param {Object} logger - Logger instance
 * @returns {Promise<void>}
 */
async function logViewerCount(config, logger, isActive = () => true, { onObservation, nowMs = Date.now, controller = new AbortController() } = {}) {
    let observation;
    let rejectAbort;
    const aborted = new Promise((resolve, reject) => { rejectAbort = reject; });
    const onAbort = () => rejectAbort(new Error('Twitch sample aborted'));
    controller.signal.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        const request = (async () => {
            const accessToken = await getValidAccessToken(config, logger, controller.signal);
            if (controller.signal.aborted) throw new Error('Twitch sample aborted');
            return getStreamInfo(config.twitch.channel, config.twitch.clientId, accessToken, controller.signal);
        })();
        const streamInfo = await Promise.race([request, aborted]);
        if (!isActive()) return;
        const intervalSeconds = config.twitch.viewerSampleIntervalSeconds || 60;
        const observedAtMs = nowMs();
        if (streamInfo) {
            observation = { status: 'online', observedAtMs, streamId: streamInfo.id, startedAtMs: Date.parse(streamInfo.started_at) };
            if (!validObservation(observation)) observation = { status: 'unknown', observedAtMs };
            logger.info('Stream viewer count', eventMetadata('viewer_sample', {
                online: true, intervalSeconds, channel: config.twitch.channel,
                viewerCount: streamInfo.viewer_count, game: streamInfo.game_name, title: streamInfo.title,
                language: streamInfo.language, startedAt: streamInfo.started_at
            }));
        } else {
            observation = { status: 'offline', observedAtMs };
            logger.info('Stream offline', eventMetadata('viewer_sample', {
                channel: config.twitch.channel, online: false, viewerCount: 0, intervalSeconds
            }));
        }
    } catch (err) {
        if (!isActive()) return;
        observation = { status: 'unknown', observedAtMs: nowMs() };
        logger.error('Error getting viewer count', eventMetadata('service_error', {
            channel: config.twitch.channel, service: 'twitch_viewers',
            intervalSeconds: config.twitch.viewerSampleIntervalSeconds || 60, error: err.message
        }));
    } finally {
        clearTimeout(timeout);
        controller.signal.removeEventListener('abort', onAbort);
    }
    if (onObservation && isActive()) {
        try { await onObservation(observation); } catch { logger.error('Broadcast observer failed'); }
    }
}

/**
 * Starts periodic viewer count monitoring
 * @param {Object} config - Configuration object
 * @param {Object} logger - Logger instance
 * Uses the configured interval in seconds (default: 60).
 * @returns {Object} Monitor handle for shutdown
 */
function startViewerCountMonitoring(config, logger, options = {}) {
    const intervalSeconds = config.twitch.viewerSampleIntervalSeconds || 60;
    const monitor = { active: true, busy: false, timer: null, controller: null };
    logger.info('Starting viewer count monitoring', { channel: config.twitch.channel, intervalSeconds });
    const sample = async () => {
        if (!monitor.active || monitor.busy) return;
        monitor.busy = true;
        try {
            monitor.controller = new AbortController();
            await logViewerCount(config, logger, () => monitor.active, { ...options, controller: monitor.controller });
        } finally {
            monitor.busy = false;
            monitor.controller = null;
        }
    };
    void sample();
    monitor.timer = setInterval(sample, intervalSeconds * 1000);
    return monitor;
}

function stopViewerCountMonitoring(monitor, logger) {
    if (monitor) {
        monitor.active = false;
        monitor.controller?.abort();
        clearInterval(monitor.timer);
        logger.info('Stopped viewer count monitoring');
    }
}

module.exports = {
    getStreamInfo,
    logViewerCount,
    startViewerCountMonitoring,
    stopViewerCountMonitoring
};
