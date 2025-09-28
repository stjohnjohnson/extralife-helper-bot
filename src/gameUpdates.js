/**
 * Game update detection and notification module
 * Handles Discord presence changes and triggers Twitch notifications
 */

const https = require('https');

/**
 * Makes an HTTPS request to the Twitch API
 * @param {string} path - API endpoint path
 * @param {Object} options - Request options (method, headers, body)
 * @param {string} clientId - Twitch client ID
 * @param {string} accessToken - OAuth access token
 * @returns {Promise<Object>} Response data
 */
function makeTwitchApiRequest(path, options = {}, clientId, accessToken) {
    return new Promise((resolve, reject) => {
        const requestOptions = {
            hostname: 'api.twitch.tv',
            port: 443,
            path: `/helix${path}`,
            method: options.method || 'GET',
            headers: {
                'Client-ID': clientId,
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        const req = https.request(requestOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    // Handle empty responses (some Twitch API endpoints return empty 204 responses)
                    if (!data && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({});
                        return;
                    }
                    
                    if (!data) {
                        reject(new Error(`Empty response with status ${res.statusCode}`));
                        return;
                    }
                    
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(`API Error ${res.statusCode}: ${parsed.message || data}`));
                    }
                } catch (err) {
                    reject(new Error(`Failed to parse response (${data.length} chars): "${data.substring(0, 200)}" - ${err.message}`));
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (options.body) {
            req.write(JSON.stringify(options.body));
        }

        req.end();
    });
}

/**
 * Gets broadcaster ID from channel name
 * @param {string} channelName - Twitch channel name
 * @param {string} clientId - Twitch client ID
 * @param {string} accessToken - OAuth access token
 * @returns {Promise<string>} Broadcaster ID
 */
async function getBroadcasterIdFromChannel(channelName, clientId, accessToken) {
    const response = await makeTwitchApiRequest(`/users?login=${channelName}`, {}, clientId, accessToken);
    if (!response.data || response.data.length === 0) {
        throw new Error(`Channel "${channelName}" not found`);
    }
    return response.data[0].id;
}

/**
 * Searches for a game category by name with smart matching
 * @param {string} gameName - Name of the game to search for
 * @param {string} clientId - Twitch client ID
 * @param {string} accessToken - OAuth access token
 * @returns {Promise<string|null>} Game ID or null if not found
 */
async function searchGameCategory(gameName, clientId, accessToken) {
    try {
        const response = await makeTwitchApiRequest(`/search/categories?query=${encodeURIComponent(gameName)}`, {}, clientId, accessToken);
        if (!response.data || response.data.length === 0) {
            return null;
        }

        // Find the best match using priority-based matching
        const bestMatch = findBestGameMatch(gameName, response.data);
        
        // Log the matching result for debugging
        if (bestMatch) {
            console.log(`Game search for "${gameName}" matched: "${bestMatch.name}" (ID: ${bestMatch.id})`);
        } else {
            console.log(`No match found for game: "${gameName}"`);
        }
        
        return bestMatch ? bestMatch.id : null;
    } catch (err) {
        throw new Error(`Failed to search for game "${gameName}": ${err.message}`);
    }
}

/**
 * Finds the best matching game from search results
 * @param {string} targetGame - The game name we're looking for
 * @param {Array} games - Array of game objects from Twitch API
 * @returns {Object|null} Best matching game object or null
 */
function findBestGameMatch(targetGame, games) {
    if (!games || games.length === 0) {
        return null;
    }
    
    const normalizeString = (str) => str.toLowerCase().trim();
    const target = normalizeString(targetGame);
    
    // Priority 1: Exact match (case insensitive)
    for (const game of games) {
        if (normalizeString(game.name) === target) {
            return game;
        }
    }
    
    // Priority 2: Starts with the target
    for (const game of games) {
        if (normalizeString(game.name).startsWith(target)) {
            return game;
        }
    }
    
    // Priority 3: Target starts with the game name (handles abbreviations)
    for (const game of games) {
        if (target.startsWith(normalizeString(game.name))) {
            return game;
        }
    }
    
    // Priority 4: Contains the target as a whole word
    for (const game of games) {
        const gameName = normalizeString(game.name);
        // Use word boundaries to match whole words
        const regex = new RegExp(`\\b${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (regex.test(gameName)) {
            return game;
        }
    }
    
    // Priority 5: Fuzzy match - target contains all characters from game name
    for (const game of games) {
        const gameName = normalizeString(game.name);
        if (gameName.length <= target.length && 
            gameName.split('').every(char => target.includes(char))) {
            return game;
        }
    }
    
    // Fallback: Return the first result (original behavior)
    return games[0];
}

/**
 * Updates Twitch channel game category
 * @param {string} broadcasterId - Broadcaster user ID
 * @param {string} gameId - Game category ID
 * @param {string} clientId - Twitch client ID
 * @param {string} accessToken - OAuth access token
 * @returns {Promise<void>}
 */
async function updateChannelGame(broadcasterId, gameId, clientId, accessToken) {
    await makeTwitchApiRequest(`/channels?broadcaster_id=${broadcasterId}`, {
        method: 'PATCH',
        body: { game_id: gameId }
    }, clientId, accessToken);
}

/**
 * Handles Discord presence updates to detect game changes
 * @param {Object} oldPresence - Previous Discord presence
 * @param {Object} newPresence - New Discord presence  
 * @param {Object} config - Configuration object
 * @param {Object} twitchClient - Twitch client instance
 * @param {Object} logger - Logger instance
 * @returns {Promise<boolean>} True if a game update was processed
 */
async function handlePresenceUpdate(oldPresence, newPresence, config, twitchClient, logger) {
    try {
        // Only monitor the specified user
        if (newPresence.userId !== config.gameUpdates.userId) {
            return false;
        }

        // Extract game information from activities
        const oldGame = getGameFromActivities(oldPresence?.activities);
        const newGame = getGameFromActivities(newPresence?.activities);

        // Check if there's a meaningful game change
        if (oldGame === newGame) {
            return false;
        }

        // Log the game change
        logger.info('Game change detected', {
            userId: newPresence.userId,
            oldGame: oldGame || 'none',
            newGame: newGame || 'none'
        });

        // Send notification for game changes (including stopping game -> Just Chatting)
        if (newGame || oldGame) {
            await sendGameUpdateNotification(newGame, config, twitchClient, logger);
            return true;
        }

        return false;
    } catch (err) {
        logger.error('Error handling presence update', { error: err.message });
        return false;
    }
}

/**
 * Extracts the currently playing game from Discord activities
 * @param {Array} activities - Discord activities array
 * @returns {string|null} Game name or null if none
 */
function getGameFromActivities(activities) {
    if (!activities || !Array.isArray(activities)) {
        return null;
    }

    // Look for "Playing" activity (type 0)
    const gameActivity = activities.find(activity => activity.type === 0);
    return gameActivity ? gameActivity.name : null;
}

/**
 * Updates Twitch channel game category
 * @param {string} gameName - Name of the new game (null for "Just Chatting")
 * @param {Object} config - Configuration object
 * @param {Object} twitchClient - Twitch client instance (for fallback chat messages)
 * @param {Object} logger - Logger instance
 * @returns {Promise<void>}
 */
async function sendGameUpdateNotification(gameName, config, twitchClient, logger) {
    try {
        if (!config.twitch.configured) {
            logger.warn('Twitch not configured for game update notification');
            return;
        }

        // Use "Just Chatting" as fallback when no game is specified
        const displayName = gameName || 'Just Chatting';
        const searchName = gameName || 'Just Chatting';

        logger.info('Updating Twitch channel game', { 
            game: displayName,
            channel: config.twitch.channel,
            clientId: config.twitch.clientId ? config.twitch.clientId.substring(0, 8) + '...' : 'undefined',
            tokenLength: config.twitch.apiOauth ? config.twitch.apiOauth.length : 0
        });

        // Get broadcaster ID (we'll cache this in the future if needed)  
        const cleanToken = config.twitch.apiOauth.replace('oauth:', '');
        const broadcasterId = await getBroadcasterIdFromChannel(
            config.twitch.channel, 
            config.twitch.clientId, 
            cleanToken
        );

        // Search for the game category
        const gameId = await searchGameCategory(
            searchName, 
            config.twitch.clientId, 
            cleanToken
        );

        if (!gameId) {
            logger.warn('Game category not found on Twitch', { game: searchName });
            return;
        }

        // Update the channel's game category
        await updateChannelGame(
            broadcasterId, 
            gameId, 
            config.twitch.clientId, 
            cleanToken
        );

        logger.info('Successfully updated Twitch channel game', {
            game: displayName,
            gameId,
            broadcasterId,
            channel: config.twitch.channel
        });

    } catch (err) {
        logger.error('Error updating Twitch channel game', { 
            game: gameName || 'Just Chatting', 
            error: err.message,
            clientId: config.twitch.clientId ? config.twitch.clientId.substring(0, 8) + '...' : 'undefined',
            channel: config.twitch.channel,
            tokenPrefix: config.twitch.apiOauth ? config.twitch.apiOauth.substring(0, 10) + '...' : 'undefined'
        });
        
        // Don't throw the error - just log it and continue
    }
}

module.exports = {
    handlePresenceUpdate,
    getGameFromActivities,
    sendGameUpdateNotification,
    makeTwitchApiRequest,
    getBroadcasterIdFromChannel,
    searchGameCategory,
    updateChannelGame,
    findBestGameMatch
};
