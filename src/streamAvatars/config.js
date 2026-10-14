const { loadThemeConfiguration } = require('./themes');
const { resolve } = require('node:path');
function parseStreamAvatarsConfiguration(env = process.env) {
    const errors = [];
    const integer = (suffix, fallback, minimum, maximum) => {
        const raw = env['STREAM_AVATARS_' + suffix] ?? String(fallback);
        const value = Number(raw);
        if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(value) || value < minimum || value > maximum) errors.push('STREAM_AVATARS_' + suffix + ' must be a valid integer');
        return value;
    };
    const stateDir = env.STREAM_AVATARS_STATE_DIR ?? './data/stream-avatars';
    const token = env.STREAM_AVATARS_TOKEN ?? '';
    if (!stateDir.trim()) errors.push('Stream Avatars state directory must not be empty');
    if (token.length < 16 || token.length > 256 || /\s/u.test(token)) errors.push('STREAM_AVATARS_TOKEN must contain 16 to 256 non-whitespace characters');
    const themes = loadThemeConfiguration();
    errors.push(...themes.errors);
    const config = { themes, token, stateDir: resolve(stateDir), donationIntervalCents: integer('DONATION_INTERVAL_CENTS', 50000, 1, 100000000) };
    return { config, errors };
}
module.exports = { parseStreamAvatarsConfiguration };
