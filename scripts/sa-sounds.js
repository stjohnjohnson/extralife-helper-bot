// Original MIT-licensed celebration cues. FFmpeg is used only when authoring Oggs.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const RATE = 44100;
const cues = [
    { name: 'sa_donation', seconds: 0.8, notes: [[0, 76], [0.12, 83], [0.25, 88]] },
    { name: 'sa_milestone', seconds: 1.5, notes: [[0, 72], [0.13, 76], [0.26, 79], [0.4, 84], [0.4, 88], [0.4, 91]] },
    { name: 'sa_goal', seconds: 2.5, notes: [[0, 72], [0.18, 76], [0.36, 79], [0.54, 84], [0.84, 79], [1.08, 84], [1.08, 88], [1.08, 91], [1.4, 96]] }
];

function wave(cue) {
    const samples = Math.round(RATE * cue.seconds), pcm = new Float64Array(samples);
    let peak = 0;
    for (let i = 0; i < samples; i++) {
        const time = i / RATE;
        for (const [start, midi] of cue.notes) {
            const t = time - start;
            if (t < 0) continue;
            const frequency = 440 * 2 ** ((midi - 69) / 12), phase = 2 * Math.PI * frequency * t;
            const envelope = Math.min(1, t / 0.012) * Math.exp(-5 * t) * Math.min(1, (cue.seconds - time) / 0.08);
            pcm[i] += envelope * (Math.sin(phase) + 0.22 * Math.sin(phase * 2) + 0.08 * Math.sin(phase * 3));
        }
        peak = Math.max(peak, Math.abs(pcm[i]));
    }
    const bytes = Buffer.alloc(44 + samples * 2);
    bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(RATE, 24); bytes.writeUInt32LE(RATE * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
    bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(pcm[i] / peak * 0.32 * 32767), 44 + i * 2);
    return bytes;
}

function run(args = process.argv.slice(2)) {
    const wavOnly = args.includes('--wav-only');
    args = args.filter(arg => arg !== '--wav-only');
    if (args.length && (args.length !== 2 || args[0] !== '--output' || !args[1])) throw new Error('Usage: node scripts/sa-sounds.js [--wav-only] [--output directory]');
    const directory = args.length ? path.resolve(args[1]) : path.resolve(__dirname, '../integrations/stream-avatars/sounds');
    fs.mkdirSync(directory, { recursive: true });
    const catalog = [];
    for (const cue of cues) {
        const file = `${cue.name}.ogg`, wav = path.join(directory, `${cue.name}.wav`);
        fs.writeFileSync(wav, wave(cue));
        if (wavOnly) continue;
        const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-map_metadata', '-1', '-ac', '2', '-c:a', 'vorbis', '-strict', 'experimental', '-q:a', '5', '-fflags', '+bitexact', '-flags:a', '+bitexact', path.join(directory, file)], { encoding: 'utf8' });
        if (result.error || result.status !== 0) throw new Error('Install FFmpeg with its native Vorbis encoder to author sounds: ' + (result.error?.message || result.stderr));
        const sha256 = createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex');
        catalog.push({ name: cue.name, file, sha256 });
        fs.unlinkSync(wav);
    }
    if (!wavOnly) fs.writeFileSync(path.join(directory, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
}

if (require.main === module) {
    try { run(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
