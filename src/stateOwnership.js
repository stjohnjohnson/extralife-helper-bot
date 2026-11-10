const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { setTimeout: delay } = require('node:timers/promises');

function ownershipError(code, message, cause) {
    return Object.assign(new Error(message, { cause }), { code });
}
async function regularFile(path) {
    const info = await fs.lstat(path);
    if (!info.isFile() || info.nlink !== 1) throw ownershipError('STATE_LOCK_INVALID', 'State ownership requires a single-link regular file');
}

// The database is a permanent lock anchor, not a progress store. Never unlink it:
// replacing its inode would let another process acquire independent ownership.
async function acquireStateOwnership(file) {
    const path = file + '.ownership.sqlite';
    try {
        const handle = await fs.open(path, 'wx', 0o600);
        await handle.close();
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
    await regularFile(path);
    let database;
    // Concurrent first opens can both fail SQLite's shared-to-exclusive upgrade.
    // Close each failed connection and retry briefly; never expire a live lock.
    for (let attempt = 0; ; attempt++) {
        try {
            database = new DatabaseSync(path, { timeout: 0 });
            database.exec('BEGIN EXCLUSIVE');
            break;
        } catch (error) {
            database?.close(); database = null;
            if (![5, 6].includes(error.errcode)) throw error;
            if (attempt === 4) throw ownershipError('STATE_LOCKED', 'State store already has an owner', error);
            await delay(10 + Math.floor(Math.random() * 20));
        }
    }
    try {
        const legacy = file + '.lock';
        try {
            await regularFile(legacy);
            // Deployment must stop old versions before starting this version.
            // All new-version contenders acquire the SQLite lock before migration.
            await fs.rename(legacy, legacy + '.archive-' + randomUUID());
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        return { close: () => database.close() };
    } catch (error) {
        database.close();
        throw error;
    }
}
module.exports = { acquireStateOwnership };
