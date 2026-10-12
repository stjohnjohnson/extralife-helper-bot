const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('sound authoring emits deterministic mono PCM with fades, headroom and distinct durations', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sa pcm '));
    try {
        const script = path.resolve(__dirname, '../scripts/sa-sounds.js');
        const result = spawnSync(process.execPath, [script, '--wav-only', '--output', directory], { encoding: 'utf8' });
        expect(result.status).toBe(0);
        const originals = {};
        for (const [name, seconds] of [['sa_donation', 3], ['sa_milestone', 18], ['sa_goal', 20]]) {
            const bytes = fs.readFileSync(path.join(directory, `${name}.wav`));
            originals[name] = bytes;
            expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
            expect(bytes.toString('ascii', 8, 12)).toBe('WAVE');
            expect(bytes.readUInt16LE(22)).toBe(1);
            expect(bytes.readUInt32LE(24)).toBe(44100);
            expect((bytes.length - 44) / 2 / 44100).toBeCloseTo(seconds, 5);
            let peak = 0;
            for (let i = 44; i < bytes.length; i += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(i)));
            expect(peak).toBeGreaterThan(5000);
            expect(peak).toBeLessThan(12000);
            expect(bytes.readInt16LE(44)).toBe(0);
            expect(Math.abs(bytes.readInt16LE(bytes.length - 2))).toBeLessThan(5);
        }
        expect(spawnSync(process.execPath, [script, '--wav-only', '--output', directory]).status).toBe(0);
        for (const [name, bytes] of Object.entries(originals)) expect(fs.readFileSync(path.join(directory, `${name}.wav`))).toEqual(bytes);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('cues attract attention promptly and sustain audio through their intended celebration body', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sa presence '));
    try {
        const script = path.resolve(__dirname, '../scripts/sa-sounds.js');
        expect(spawnSync(process.execPath, [script, '--wav-only', '--output', directory]).status).toBe(0);
        for (const [name, seconds] of [['sa_donation', 3], ['sa_milestone', 18], ['sa_goal', 20]]) {
            const bytes = fs.readFileSync(path.join(directory, `${name}.wav`));
            const rms = (start, length) => {
                let sum = 0;
                const count = Math.round(length * 44100), first = Math.round(start * 44100);
                for (let sample = first; sample < first + count; sample++) {
                    const offset = 44 + sample * 2;
                    const value = offset + 2 <= bytes.length ? bytes.readInt16LE(offset) : 0;
                    sum += value * value;
                }
                return Math.sqrt(sum / count);
            };
            expect(rms(0, 0.05)).toBeGreaterThan(500);
            // Lengthening the old cues with silence must not satisfy party duration.
            for (let start = 0.25; start < seconds - 0.75; start += 0.5) {
                expect(rms(start, 0.25)).toBeGreaterThan(250);
            }
            expect(rms(seconds - 0.1, 0.1)).toBeLessThan(rms(0, 0.05));
        }
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
