const defaultFs = require('node:fs/promises');
const { resolve, dirname, join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { createInitialState, validateSessionState } = require('./state');

async function identity(path) {
    const absolute = resolve(path);
    try { const stat = await defaultFs.stat(absolute); return { path: await defaultFs.realpath(absolute), stat }; }
    catch (error) {
        if (error.code !== 'ENOENT') throw error;
        try { return { path: join(await defaultFs.realpath(dirname(absolute)), absolute.slice(dirname(absolute).length + 1)) }; }
        catch (error) { if (error.code !== 'ENOENT') throw error; return { path: absolute }; }
    }
}
async function assertDistinctPaths(first, second) {
    const [a, b] = await Promise.all([identity(first), identity(second)]);
    if (a.path === b.path || (a.stat && b.stat && a.stat.dev === b.stat.dev && a.stat.ino === b.stat.ino)) {
        throw new Error('Production and rehearsal stores must be separate');
    }
}
function createSessionStore({ path, mode, channel, fs = defaultFs }) {
    const file = resolve(path);
    const lock = file + '.lock';
    const recovery = file + '.recovery-required';
    let owned = false;
    let closed = false;
    let lastRevision = -1;
    let tail = Promise.resolve();
    const validate = value => validateSessionState(value, { mode, channel });
    const enqueue = operation => {
        const result = tail.then(operation);
        tail = result.catch(() => {});
        return result;
    };
    const assertOwner = () => { if (closed) throw new Error('Session store closed'); if (!owned) throw new Error('Session store requires its owner'); };
    const read = async source => validate(JSON.parse(await fs.readFile(source, 'utf8')));
    const syncDirectory = async () => {
        if (process.platform !== 'linux') return;
        const directory = await fs.open(dirname(file), 'r');
        try { await directory.sync(); } finally { await directory.close(); }
    };
    const quarantine = async () => { await fs.rename(file, file + '.quarantine-' + randomUUID()); await syncDirectory(); };
    const clearRecovery = async () => { await fs.rm(recovery, { force: true }); await syncDirectory(); };
    const save = state => enqueue(async () => {
        assertOwner();
        state = validate(state);
        if (state.revision <= lastRevision) return;
        const temp = file + '.' + randomUUID() + '.tmp';
        try {
            const handle = await fs.open(temp, 'wx', 0o600);
            try { await handle.writeFile(JSON.stringify(state)); await handle.sync(); } finally { await handle.close(); }
            try { await fs.copyFile(file, file + '.backup'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
            await fs.rename(temp, file);
            await syncDirectory();
            lastRevision = state.revision;
        } finally { await fs.rm(temp, { force: true }); }
    });
    return {
        async load() {
            if (closed) throw new Error('Session store closed');
            await fs.mkdir(dirname(file), { recursive: true, mode: 0o700 });
            try {
                const info = await fs.lstat(file);
                if (info.isSymbolicLink() || info.nlink > 1) throw new Error('Session state must not use links');
            } catch (error) { if (error.code !== 'ENOENT') throw error; }
            if (!owned) {
                let handle;
                try { handle = await fs.open(lock, 'wx', 0o600); }
                catch (error) { if (error.code === 'EEXIST') throw new Error('Session store already has an owner; validate stale lock before removal'); throw error; }
                owned = true;
                try { await handle.writeFile(JSON.stringify({ pid: process.pid })); } finally { await handle.close(); }
            }
            let requiresRecovery = false;
            try { await fs.access(recovery); requiresRecovery = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
            if (requiresRecovery) {
                // Finish an interrupted quarantine without replacing the last valid backup.
                try { await read(file); } catch (error) { if (error.code !== 'ENOENT') await quarantine(); }
                throw new Error('Session state requires recovery');
            }
            try {
                const state = await read(file); lastRevision = state.revision; return state;
            } catch (error) {
                if (error.code === 'ENOENT') return null;
                // Persist the recovery gate before moving the corrupt original, including across crashes.
                const marker = await fs.open(recovery, 'wx', 0o600);
                try { await marker.writeFile('corrupt-state'); await marker.sync(); } finally { await marker.close(); }
                await syncDirectory();
                await quarantine();
                throw new Error('Session state requires recovery');
            }
        },
        save,
        async archiveAndReset() {
            await tail; assertOwner();
            try { await fs.copyFile(file, file + '.archive-' + randomUUID()); } catch (error) { if (error.code !== 'ENOENT') throw error; }
            const initial = { ...createInitialState({ mode, channel }), revision: Math.max(0, lastRevision + 1) };
            await save(initial); await clearRecovery(); return initial;
        },
        async recoverLastBackup() {
            await tail; assertOwner();
            const backup = await read(file + '.backup');
            backup.revision = Math.max(backup.revision, lastRevision + 1);
            await save(backup); await clearRecovery(); return backup;
        },
        flush: () => tail,
        async close() { await tail; if (owned) { await fs.rm(lock, { force: true }); owned = false; } closed = true; }
    };
}
module.exports = { createSessionStore, assertDistinctPaths };
