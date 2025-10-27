/**
 * Twitch viewer count monitoring module
 * Handles periodic logging of stream viewer counts and status
 */

const { makeTwitchApiRequest, getValidAccessToken } = require('./gameUpdates.js');

/**
 * Gets current stream information including viewer count
 * @param {string} channelName - Twitch channel name
 * @param {string} clientId - Twitch client ID
 * @param {string} accessToken - OAuth access token
 * @returns {Promise<Object|null>} Stream data or null if offline
 */
async function getStreamInfo(channelName, clientId, accessToken) {
    const response = await makeTwitchApiRequest(`/streams?user_login=${channelName}`, {}, clientId, accessToken);
    
    if (!response.data || response.data.length === 0) {
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
async function logViewerCount(config, logger) {
    try {
        // Get a valid access token
        const accessToken = await getValidAccessToken(config, logger);
        
        // Get stream information
        const streamInfo = await getStreamInfo(
            config.twitch.channel,
            config.twitch.clientId,
            accessToken
        );
        
        if (streamInfo) {
            logger.info('Stream viewer count', {
                channel: config.twitch.channel,
                viewerCount: streamInfo.viewer_count,
                game: streamInfo.game_name,
                title: streamInfo.title,
                language: streamInfo.language,
                startedAt: streamInfo.started_at
            });
        } else {
            logger.info('Stream status', {
                channel: config.twitch.channel,
                status: 'offline'
            });
        }
    } catch (err) {
        logger.error('Error getting viewer count', {
            channel: config.twitch.channel,
            error: err.message
        });
    }
}

/**
 * Starts periodic viewer count monitoring
 * @param {Object} config - Configuration object
 * @param {Object} logger - Logger instance
 * @param {number} intervalMinutes - How often to check (default: 5 minutes)
 * @returns {NodeJS.Timer} Interval timer (can be used to stop monitoring)
 */
function startViewerCountMonitoring(config, logger, intervalMinutes = 5) {
    const intervalMs = intervalMinutes * 60 * 1000; // Convert minutes to milliseconds
    
    logger.info('Starting viewer count monitoring', {
        channel: config.twitch.channel,
        intervalMinutes
    });
    
    // Log immediately on start
    logViewerCount(config, logger);
    
    // Set up periodic logging
    return setInterval(() => {
        logViewerCount(config, logger);
    }, intervalMs);
}

/**
 * Stops viewer count monitoring
 * @param {NodeJS.Timer} monitoringInterval - The interval timer to stop
 * @param {Object} logger - Logger instance
 */
function stopViewerCountMonitoring(monitoringInterval, logger) {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        logger.info('Stopped viewer count monitoring');
    }
}

module.exports = {
    getStreamInfo,
    logViewerCount,
    startViewerCountMonitoring,
    stopViewerCountMonitoring
};