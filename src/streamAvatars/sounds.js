const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const DEFAULT_SOUNDS = {
    donation: ['sa_donation', 'sa_donation_2', 'sa_donation_3', 'sa_donation_4', 'sa_donation_5', 'sa_donation_6'],
    milestone: ['sa_milestone', 'sa_milestone_2'], goal: 'sa_goal'
};
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_BYTES = 4 * 1024 * 1024;

function read(filename, limit = MAX_BYTES) {
    const stat = fs.lstatSync(filename);
    if (!stat.isFile()) throw new Error('Sound assets must be regular files');
    if (stat.size > limit) throw new Error('Sound asset exceeds size limit');
    return fs.readFileSync(filename);
}

// Ogg uses the non-reflected CRC-32 polynomial, unlike PNG/zlib CRC-32.
function oggCrc(bytes) {
    let value = 0;
    for (const byte of bytes) {
        value ^= byte << 24;
        for (let bit = 0; bit < 8; bit++) value = (value << 1) ^ (value & 0x80000000 ? 0x04c11db7 : 0);
    }
    return value >>> 0;
}

function validateOgg(bytes) {
    const invalid = () => { throw new Error('Invalid Ogg Vorbis sound'); };
    const packets = [], pieces = [];
    let offset = 0, serial, sequence = 0, ended = false, granule = 0n;
    while (offset < bytes.length) {
        if (ended || offset + 27 > bytes.length || bytes.toString('ascii', offset, offset + 4) !== 'OggS' || bytes[offset + 4] !== 0) invalid();
        const flags = bytes[offset + 5], segments = bytes[offset + 26], headerEnd = offset + 27 + segments;
        if (headerEnd > bytes.length || flags > 7 || Boolean(flags & 1) !== Boolean(pieces.length) || Boolean(flags & 2) !== (sequence === 0)) invalid();
        const stream = bytes.readUInt32LE(offset + 14);
        if (serial === undefined) serial = stream;
        if (stream !== serial || bytes.readUInt32LE(offset + 18) !== sequence++) invalid();
        const laces = bytes.subarray(offset + 27, headerEnd);
        const end = headerEnd + laces.reduce((total, size) => total + size, 0);
        if (end > bytes.length) invalid();
        const page = Buffer.from(bytes.subarray(offset, end)), checksum = page.readUInt32LE(22);
        page.writeUInt32LE(0, 22);
        if (oggCrc(page) !== checksum) invalid();
        let dataOffset = headerEnd;
        for (const size of laces) {
            pieces.push(bytes.subarray(dataOffset, dataOffset + size)); dataOffset += size;
            if (size < 255) { packets.push(Buffer.concat(pieces)); pieces.length = 0; }
        }
        ended = Boolean(flags & 4); granule = bytes.readBigUInt64LE(offset + 6); offset = end;
    }
    if (!ended || pieces.length || packets.length < 4) invalid();
    const header = packets[0];
    if (header.length !== 30 || header[0] !== 1 || header.toString('ascii', 1, 7) !== 'vorbis' || header.readUInt32LE(7) !== 0 || ![1, 2].includes(header[11]) || header[29] !== 1) invalid();
    const rate = header.readUInt32LE(12);
    if (![44100, 48000].includes(rate) || granule === 0n || granule > BigInt(rate * 30)) invalid();
    for (const [index, type] of [[1, 3], [2, 5]]) if (packets[index][0] !== type || packets[index].toString('ascii', 1, 7) !== 'vorbis') invalid();
    if (packets.slice(3).some(packet => !packet.length || packet[0] & 1)) invalid();
}

function loadSounds(integrationDir) {
    const directory = path.join(integrationDir, 'sounds');
    if (!fs.lstatSync(directory).isDirectory()) throw new Error('Sounds must be a regular directory');
    let catalog;
    try { catalog = JSON.parse(read(path.join(directory, 'catalog.json'), 64 * 1024)); }
    catch (error) { if (error instanceof SyntaxError) throw new Error('Sound catalog contains invalid JSON', { cause: error }); throw error; }
    if (!Array.isArray(catalog) || !catalog.length || catalog.length > 16) throw new Error('Invalid sound catalog');
    const names = new Set(), files = Object.create(null);
    for (const entry of catalog) {
        if (!entry || typeof entry.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(entry.name) || RESERVED.test(entry.name) ||
            typeof entry.file !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}\.ogg$/.test(entry.file) || RESERVED.test(entry.file.slice(0, -4)) ||
            typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid sound catalog entry');
        const key = entry.name.toLowerCase();
        if (names.has(key)) throw new Error('Duplicate sound name');
        names.add(key);
        const bytes = read(path.join(directory, entry.file));
        validateOgg(bytes);
        if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('Sound digest mismatch: ' + entry.name);
        files[`${entry.name}.ogg`] = bytes;
    }
    for (const name of Object.values(DEFAULT_SOUNDS).flat()) if (!Object.hasOwn(files, `${name}.ogg`)) throw new Error('Sound catalog requires ' + name);
    return files;
}

module.exports = { loadSounds, DEFAULT_SOUNDS };
