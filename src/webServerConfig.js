function parseWebServerConfiguration(env = process.env) {
    const errors = [];
    const hostKey = env.WEB_HOST !== undefined ? 'WEB_HOST' : 'VOICE_OVERLAY_HOST';
    const portKey = env.WEB_PORT !== undefined ? 'WEB_PORT' : 'VOICE_OVERLAY_PORT';
    const host = env[hostKey] ?? '0.0.0.0';
    const rawPort = env[portKey] ?? '3000';
    const port = Number(rawPort);
    if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
        errors.push(`${portKey} must be an integer between 1 and 65535`);
    }
    if (!host.trim()) errors.push(`${hostKey} must not be empty`);
    return { host, port, errors };
}
module.exports = { parseWebServerConfiguration };
