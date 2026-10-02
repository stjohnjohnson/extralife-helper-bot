/**
 * Twitch viewer count monitoring module
 * Handles periodic logging of stream viewer counts and status
 */

const { makeTwitchApiRequest, getValidAccessToken } = require('./gameUpdates.js');
const { eventMetadata } = require('./analysis/eventMetadata.js');

/**
 * Gets current stream information including viewer count
 * @param {string} channelName - Twitch channel name
 * @param {string} clientId - Twitch client ID
 * @param {string} accessToken - OAuth access token
 * @returns {Promise<Object|null>} Stream data or null if offline
 */
async function getStreamInfo(channelName, clientId, accessToken) {
    const response = await makeTwitchApiRequest(`/streams?user_login=${channelName}`, {}, clientId, accessToken);

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
async function logViewerCount(config, logger, isActive = () => true) {
    try {
        // Get a valid access token
        const accessToken = await getValidAccessToken(config, logger);

        // Get stream information
        const streamInfo = await getStreamInfo(
            config.twitch.channel,
            config.twitch.clientId,
            accessToken
        );

        if (!isActive()) return;
        const intervalSeconds = config.twitch.viewerSampleIntervalSeconds || 60;
        if (streamInfo) {
            logger.info('Stream viewer count', eventMetadata('viewer_sample', {
                online: true,
                intervalSeconds,
                channel: config.twitch.channel,
                viewerCount: streamInfo.viewer_count,
                game: streamInfo.game_name,
                title: streamInfo.title,
                language: streamInfo.language,
                startedAt: streamInfo.started_at
            }));
        } else {
            logger.info('Stream offline', eventMetadata('viewer_sample', {
                channel: config.twitch.channel, online: false, viewerCount: 0, intervalSeconds
            }));
        }
    } catch (err) {
        if (!isActive()) return;
        logger.error('Error getting viewer count', eventMetadata('service_error', {
            channel: config.twitch.channel,
            service: 'twitch_viewers',
            intervalSeconds: config.twitch.viewerSampleIntervalSeconds || 60,
            error: err.message
        }));
    }
}

/**
 * Starts periodic viewer count monitoring
 * @param {Object} config - Configuration object
 * @param {Object} logger - Logger instance
 * Uses the configured interval in seconds (default: 60).
 * @returns {Object} Monitor handle for shutdown
 */
function startViewerCountMonitoring(config, logger) {
    const intervalSeconds = config.twitch.viewerSampleIntervalSeconds || 60;
    const monitor = { active: true, busy: false, timer: null };
    logger.info('Starting viewer count monitoring', { channel: config.twitch.channel, intervalSeconds });
    const sample = async () => {
        if (!monitor.active || monitor.busy) return;
        monitor.busy = true;
        try {
            await logViewerCount(config, logger, () => monitor.active);
        } finally {
            monitor.busy = false;
        }
    };
    void sample();
    monitor.timer = setInterval(sample, intervalSeconds * 1000);
    return monitor;
}

function stopViewerCountMonitoring(monitor, logger) {
    if (monitor) {
        monitor.active = false;
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
