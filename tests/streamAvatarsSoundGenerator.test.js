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
        for (const [name, seconds] of [['sa_donation', 0.8], ['sa_milestone', 1.5], ['sa_goal', 2.5]]) {
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
