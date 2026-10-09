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
    const coordinate = (suffix, fallback, minimum, maximum) => {
        const raw = env['STREAM_AVATARS_' + suffix] ?? String(fallback);
        const value = Number(raw);
        if (requested && (!/^-?\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(value) || value < minimum || value > maximum)) errors.push('STREAM_AVATARS_' + suffix + ' must be a finite coordinate');
        return value;
    };
    const stateDir = env.STREAM_AVATARS_STATE_DIR ?? './data/stream-avatars';
    const token = env.STREAM_AVATARS_TOKEN ?? '';
    if (requested && !stateDir.trim()) errors.push('Stream Avatars state directory must not be empty');
    if (requested && (token.length < 16 || token.length > 256)) errors.push('STREAM_AVATARS_TOKEN must contain 16 to 256 characters');
    const strip = { x: coordinate('STRIP_X', 0, -16384, 16384), y: coordinate('STRIP_Y', 0, -16384, 16384), width: coordinate('STRIP_WIDTH', 0, Number.MIN_VALUE, 16384), height: coordinate('STRIP_HEIGHT', 0, Number.MIN_VALUE, 16384) };
    const config = { token, stateDir: resolve(stateDir), strip,
        graceMs: integer('OFFLINE_GRACE_SECONDS', 900, 1, 86400) * 1000,
        maxHearts: integer('MAX_HEARTS', 50, 1, 100), heartOffset: coordinate('HEART_OFFSET', 16, 0, 512) };
    return { enabled: requested && errors.length === 0, config, errors };
}
module.exports = { parseStreamAvatarsConfiguration };
