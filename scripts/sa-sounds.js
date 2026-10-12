// Original MIT-licensed celebration cues. FFmpeg is used only when authoring Oggs.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const RATE = 44100;
const cues = [
    { name: 'sa_donation', seconds: 3 },
    { name: 'sa_milestone', seconds: 18 },
    { name: 'sa_goal', seconds: 20 }
];

function addVoice(pcm, start, duration, amplitude, voice) {
    const first = Math.round(start * RATE), count = Math.round(duration * RATE);
    for (let i = 0; i < count && first + i < pcm.length; i++) {
        const t = i / RATE;
        const envelope = Math.min(1, t / 0.006) * Math.min(1, (duration - t) / 0.06);
        pcm[first + i] += amplitude * envelope * voice(t);
    }
}

function tone(pcm, start, midi, duration, amplitude = 0.5) {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    addVoice(pcm, start, duration, amplitude, t => {
        const phase = 2 * Math.PI * frequency * t;
        return Math.exp(-3 * t / duration) * (Math.sin(phase) + 0.25 * Math.sin(phase * 3) + 0.08 * Math.sin(phase * 5));
    });
}

function percussion(pcm, start, snare, seed) {
    if (!snare) {
        addVoice(pcm, start, 0.18, 0.4, t => Math.sin(2 * Math.PI * (48 * t + 7 * (1 - Math.exp(-35 * t)))) * Math.exp(-24 * t));
        return;
    }
    let state = seed, previous = 0;
    addVoice(pcm, start, 0.1, 0.12, t => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        const noise = state / 0x80000000 - 1, filtered = noise - previous;
        previous = noise;
        return filtered * Math.exp(-35 * t);
    });
}

function arrangement(cue, pcm) {
    if (cue.name === 'sa_donation') {
        const notes = [[0, 72], [0.15, 76], [0.3, 79], [0.45, 84], [0.75, 79], [1.05, 84], [1.35, 88], [1.65, 91]];
        for (const [start, midi] of notes) tone(pcm, start, midi, 0.42);
        for (const midi of [72, 76, 79, 84]) tone(pcm, 2.05, midi, 0.95, 0.28);
        return;
    }
    // 150 BPM, changing chords and eighth-note melodies keep the party moving.
    // Reserve the final 1.2 seconds for a resolving chord instead of a cut loop.
    const goal = cue.name === 'sa_goal', beat = 0.4, finish = cue.seconds - 1.2;
    const chords = [[72, 4], [69, 3], [77, 4], [79, 4]];
    for (let step = 0; step * beat / 2 < finish; step++) {
        const start = step * beat / 2, [root, third] = chords[Math.floor(step / 8) % chords.length];
        const hook = goal ? [12, 7, third, 7, 2, third, 7, 12] : [0, third, 7, third, 9, 7, third, 2];
        const duration = Math.min(0.28, finish - start);
        tone(pcm, start, root + hook[step % 8], duration, goal ? 0.48 : 0.5);
        if (goal && step % 4 === 0) tone(pcm, start, root + 19, duration, 0.12);
        if (step % 2 === 0) {
            tone(pcm, start, root - 24 + (step % 4 === 2 ? 7 : 0), Math.min(0.38, finish - start), 0.45);
            percussion(pcm, start, step % 4 === 2, step + 1);
        }
        if (step % 8 === 0) {
            for (const offset of [0, third, 7]) tone(pcm, start, root - 12 + offset, Math.min(1.1, finish - start), 0.11);
        }
    }
    for (const midi of [48, 60, 72, 76, 79, ...(goal ? [84, 88] : [])]) tone(pcm, finish, midi, 1.2, 0.24);
}

function wave(cue) {
    const samples = Math.round(RATE * cue.seconds), pcm = new Float64Array(samples);
    arrangement(cue, pcm);
    let peak = 0;
    for (let i = 0; i < samples; i++) {
        pcm[i] *= Math.min(1, i / (RATE * 0.003), (samples - 1 - i) / (RATE * 0.08));
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
