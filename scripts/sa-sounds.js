// Authoring only: prepare the supplied family recordings. Packaging needs Node alone.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { DEFAULT_SOUNDS } = require('../src/streamAvatars/sounds');

const SOURCES = path.resolve(__dirname, '../integrations/stream-avatars/sounds/recordings');
const OUTPUT = path.resolve(__dirname, '../integrations/stream-avatars/sounds');

function read(filename, limit) {
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.size > limit) throw new Error('Invalid recording file');
    return fs.readFileSync(filename);
}

function readRecordings(directory = SOURCES) {
    if (!fs.lstatSync(directory).isDirectory()) throw new Error('Invalid recording directory');
    const catalog = JSON.parse(read(path.join(directory, 'catalog.json'), 64 * 1024));
    if (!Array.isArray(catalog) || !catalog.length || catalog.length > 16) throw new Error('Invalid recording catalog');
    const names = new Set();
    const clips = catalog.map(entry => {
        if (!entry || typeof entry.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(entry.name) ||
            entry.file !== entry.name + '.wav' || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid recording catalog entry');
        if (names.has(entry.name.toLowerCase())) throw new Error('Duplicate recording name');
        names.add(entry.name.toLowerCase());
        const filename = path.join(directory, entry.file), bytes = read(filename, 4 * 1024 * 1024);
        if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('Recording digest mismatch');
        // Source copies are metadata-free 44.1 kHz, mono, signed 16-bit PCM.
        if (bytes.length < 46 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.readUInt32LE(4) !== bytes.length - 8 ||
            bytes.toString('ascii', 8, 16) !== 'WAVEfmt ' || bytes.readUInt32LE(16) !== 16 || bytes.readUInt16LE(20) !== 1 ||
            bytes.readUInt16LE(22) !== 1 || bytes.readUInt32LE(24) !== 44100 || bytes.readUInt32LE(28) !== 88200 ||
            bytes.readUInt16LE(32) !== 2 || bytes.readUInt16LE(34) !== 16 || bytes.toString('ascii', 36, 40) !== 'data' ||
            bytes.readUInt32LE(40) !== bytes.length - 44 || (bytes.length - 44) % 2) throw new Error('Invalid recording PCM');
        const duration = (bytes.length - 44) / 88200;
        if (!Number.isFinite(entry.startSeconds) || !Number.isFinite(entry.endSeconds) || !Number.isFinite(entry.gainDb) ||
            entry.startSeconds < 0 || entry.endSeconds <= entry.startSeconds || entry.endSeconds > duration + 1 / 44100 ||
            duration > 30 || entry.gainDb < -60 || entry.gainDb > 0) throw new Error('Invalid recording preparation bounds');
        const length = entry.endSeconds - entry.startSeconds;
        const filter = `atrim=start=${entry.startSeconds}:end=${entry.endSeconds},asetpts=PTS-STARTPTS,volume=${entry.gainDb}dB,afade=t=in:d=0.003,afade=t=out:st=${Math.max(0, length - 0.01)}:d=0.01`;
        return { ...entry, filename, filter };
    });
    for (const name of Object.values(DEFAULT_SOUNDS).flat()) if (!names.has(name)) throw new Error('Recording catalog requires ' + name);
    return clips;
}

function run(args = process.argv.slice(2)) {
    const wavOnly = args.includes('--wav-only'), checkOnly = args.includes('--check');
    args = args.filter(arg => arg !== '--wav-only' && arg !== '--check');
    if (args.length && (args.length !== 2 || args[0] !== '--output' || !args[1])) throw new Error('Usage: node scripts/sa-sounds.js [--check] [--wav-only] [--output directory]');
    const clips = readRecordings();
    if (checkOnly) { console.log(`Verified ${clips.length} source recordings`); return; }
    const directory = args.length ? path.resolve(args[1]) : OUTPUT;
    fs.mkdirSync(directory, { recursive: true });
    const catalog = [];
    for (const clip of clips) {
        const file = `${clip.name}.${wavOnly ? 'wav' : 'ogg'}`;
        const encoding = wavOnly ? ['-ac', '1', '-c:a', 'pcm_s16le'] : ['-ac', '2', '-c:a', 'vorbis', '-strict', 'experimental', '-q:a', '5'];
        const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', clip.filename, '-af', clip.filter, '-map_metadata', '-1', '-ar', '44100', ...encoding, '-fflags', '+bitexact', '-flags:a', '+bitexact', path.join(directory, file)], { encoding: 'utf8' });
        if (result.error || result.status !== 0) throw new Error('Install FFmpeg with its native Vorbis encoder to prepare recordings: ' + (result.error?.message || result.stderr));
        const sha256 = createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex');
        catalog.push({ name: clip.name, file, sha256 });
    }
    if (!wavOnly) fs.writeFileSync(path.join(directory, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
}

if (require.main === module) {
    try { run(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { readRecordings, run };
