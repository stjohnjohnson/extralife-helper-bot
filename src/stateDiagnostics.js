const reasons = {
    STATE_LOCKED: 'ownership-conflict', STATE_LOCK_INVALID: 'invalid-lock', STATE_INVALID: 'invalid-state', STATE_RECOVERY_REQUIRED: 'recovery-required',
    SQLITE_PERM: 'permission-denied', SQLITE_READONLY: 'read-only-filesystem', SQLITE_IOERR: 'filesystem-error', SQLITE_CORRUPT: 'invalid-lock',
    SQLITE_FULL: 'storage-full', SQLITE_CANTOPEN: 'filesystem-error', SQLITE_NOTADB: 'invalid-lock',
    EACCES: 'permission-denied', EPERM: 'permission-denied', ENOSPC: 'storage-full', EDQUOT: 'storage-full', ENOENT: 'missing-file',
    EIO: 'filesystem-error', EROFS: 'read-only-filesystem', ENOTDIR: 'filesystem-error', EISDIR: 'filesystem-error', EMFILE: 'filesystem-error', ENFILE: 'filesystem-error'
};
const sqliteCodes = { 3: 'SQLITE_PERM', 8: 'SQLITE_READONLY', 10: 'SQLITE_IOERR', 11: 'SQLITE_CORRUPT', 13: 'SQLITE_FULL', 14: 'SQLITE_CANTOPEN', 26: 'SQLITE_NOTADB' };
const guidance = {
    'ownership-conflict': 'Stop the other instance, then restart this bot.',
    'invalid-lock': 'Check the state ownership files, then restart this bot.',
    'invalid-state': 'Use the confirmed recovery command to restore a valid backup.',
    'recovery-required': 'Use the confirmed recovery command to restore a valid backup.',
    'permission-denied': 'Make the state directory writable by the bot, then restart it.',
    'storage-full': 'Free disk space or quota, then restart the bot.',
    'read-only-filesystem': 'Mount the state directory writable, then restart the bot.',
    'missing-file': 'Check the state directory and backup files.',
    'filesystem-error': 'Check the state filesystem, then restart the bot.',
    'state-error': 'Check the state storage and recovery configuration.'
};
function describeStateError(error, operation) {
    const visited = new Set();
    for (let cause = error; cause && !visited.has(cause); cause = cause.cause) {
        visited.add(cause);
        if (Object.hasOwn(reasons, cause.code)) return { reason: reasons[cause.code], code: cause.code, operation };
        if (cause.code === 'ERR_SQLITE_ERROR' && Number.isInteger(cause.errcode)) {
            const code = sqliteCodes[cause.errcode & 255];
            if (code) return { reason: reasons[code], code, operation };
        }
        if (cause instanceof SyntaxError) return { reason: 'invalid-state', operation };
    }
    return { reason: 'state-error', operation };
}
function formatStateError(error) {
    const reason = Object.hasOwn(guidance, error?.reason) ? error.reason : 'state-error';
    const code = Object.hasOwn(reasons, error?.code) ? ` (${error.code})` : '';
    return `${reason}${code}. ${guidance[reason]}`;
}
function createStateDiagnostics({ store, logger }) {
    let stateError = null, originalError;
    return {
        capture(error, operation) {
            const next = describeStateError(error, operation);
            const changed = JSON.stringify(next) !== JSON.stringify(stateError);
            stateError = next; originalError = error;
            if (changed) logger?.warn?.('Stream Avatars state unavailable', { store, ...next, action: guidance[next.reason] });
        },
        get: () => stateError ? { ...stateError } : null,
        unavailable: message => new Error(message, { cause: originalError }),
        clear() { stateError = null; originalError = undefined; }
    };
}
module.exports = { createStateDiagnostics, formatStateError };
