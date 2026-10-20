const defaultFs = require('node:fs/promises');
const { resolve, join } = require('node:path');
const { randomUUID } = require('node:crypto');

function createDonationReplay({ participantId, directory = './data/donations', fs = defaultFs }) {
    participantId = String(participantId);
    const folder = resolve(directory);
    const file = join(folder, encodeURIComponent(participantId) + '.json');
    const validId = id => id === null || (typeof id === 'string' && id.trim().length > 0 && id.length <= 128);

    async function save(lastDonationId) {
        if (!validId(lastDonationId)) throw new Error('Invalid donation checkpoint ID');
        await fs.mkdir(folder, { recursive: true, mode: 0o700 });
        const temporary = file + '.' + randomUUID() + '.tmp';
        try {
            const handle = await fs.open(temporary, 'wx', 0o600);
            try {
                await handle.writeFile(JSON.stringify({ version: 1, participantId, lastDonationId }));
                await handle.sync();
            } finally { await handle.close(); }
            await fs.rename(temporary, file);
            if (process.platform === 'linux') {
                const folderHandle = await fs.open(folder, 'r');
                try { await folderHandle.sync(); } finally { await folderHandle.close(); }
            }
        } finally { await fs.rm(temporary, { force: true }); }
    }

    return {
        async load() {
            let contents;
            try { contents = await fs.readFile(file, 'utf8'); }
            catch (error) { if (error.code === 'ENOENT') return null; throw error; }
            const state = JSON.parse(contents);
            if (!state || state.version !== 1 || state.participantId !== participantId || !validId(state.lastDonationId)) {
                throw new Error('Invalid donation checkpoint; restore the state file before retrying');
            }
            return { lastDonationId: state.lastDonationId };
        },
        async process({ donations, baseline }, announce, signal) {
            signal?.throwIfAborted();
            if (baseline) {
                await save(donations[0]?.donationID ?? null);
                return;
            }
            for (const donation of [...donations].reverse()) {
                signal?.throwIfAborted();
                await announce(donation);
                signal?.throwIfAborted();
                await save(donation.donationID);
            }
        }
    };
}

module.exports = { createDonationReplay };
