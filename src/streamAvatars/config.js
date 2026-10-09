const { loadThemeConfiguration } = require('./themes');
const { resolve } = require('node:path');
const { parseWebServerConfiguration } = require('../webServerConfig');
function parseStreamAvatarsConfiguration(env = process.env) {
    const errors = [];
    const flag = env.STREAM_AVATARS_ENABLED;
    if (flag !== undefined && !['true', 'false'].includes(flag)) errors.push('STREAM_AVATARS_ENABLED must be true or false');
    const requested = flag === 'true';
    if (requested) errors.push(...parseWebServerConfiguration(env).errors);
    const integer = (suffix, fallback, minimum, maximum) => {
        const raw = env['STREAM_AVATARS_' + suffix] ?? String(fallback);
        const value = Number(raw);
        if (requested && (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(value) || value < minimum || value > maximum)) errors.push('STREAM_AVATARS_' + suffix + ' must be a valid integer');
        return value;
    };
    const stateDir = env.STREAM_AVATARS_STATE_DIR ?? './data/stream-avatars';
    const token = env.STREAM_AVATARS_TOKEN ?? '';
    if (requested && !stateDir.trim()) errors.push('Stream Avatars state directory must not be empty');
    if (requested && (token.length < 16 || token.length > 256)) errors.push('STREAM_AVATARS_TOKEN must contain 16 to 256 characters');
    const themePackDir = env.STREAM_AVATARS_THEME_PACK;
    if (requested && themePackDir !== undefined && (!themePackDir.trim() || themePackDir.startsWith('\\\\') || /^[a-z]+:\/\//i.test(themePackDir))) errors.push('STREAM_AVATARS_THEME_PACK must be a trusted local directory');
    const themes = loadThemeConfiguration({ file: env.STREAM_AVATARS_THEME_CONFIG });
    const config = { ...(themePackDir ? { themePackDir } : {}), themes, token, stateDir: resolve(stateDir), donationIntervalCents: integer('DONATION_INTERVAL_CENTS', 50000, 1, 100000000) };
    return { enabled: requested && errors.length === 0, config, errors };
}
module.exports = { parseStreamAvatarsConfiguration };
