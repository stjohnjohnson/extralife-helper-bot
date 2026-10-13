const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readRecordings } = require('../scripts/sa-sounds');

const names = ['sa_donation', 'sa_donation_2', 'sa_donation_3', 'sa_donation_4', 'sa_milestone', 'sa_milestone_2', 'sa_goal'];
const sources = path.resolve(__dirname, '../integrations/stream-avatars/sounds/recordings');

test('recording preparation keeps seven original PCM performances with bounded trims and headroom', () => {
    const clips = readRecordings();
    expect(clips.map(clip => clip.name)).toEqual(names);
    for (const clip of clips) {
        expect(clip.endSeconds - clip.startSeconds).toBeGreaterThan(0.5);
        expect(clip.endSeconds - clip.startSeconds).toBeLessThan(7);
        expect(clip.gainDb).toBeLessThan(0);
        expect(clip.filter).toContain('asetpts=PTS-STARTPTS');
        expect(clip.filter).toContain('afade');
    }
});

test('authoring rejects changed recordings, unsafe names and invalid preparation bounds before encoding', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sa recording '));
    try {
        fs.cpSync(sources, directory, { recursive: true });
        const filename = path.join(directory, 'catalog.json');
        const original = JSON.parse(fs.readFileSync(filename));
        for (const [field, value] of [['file', '../private.wav'], ['name', '../bad'], ['startSeconds', -1], ['endSeconds', 100], ['gainDb', 20]]) {
            const catalog = structuredClone(original);catalog[0][field] = value;
            fs.writeFileSync(filename, JSON.stringify(catalog));
            expect(() => readRecordings(directory)).toThrow(/recording|preparation|catalog/i);
        }
        fs.writeFileSync(filename, JSON.stringify(original));
        const file = path.join(directory, original[0].file);
        const changed = fs.readFileSync(file);changed[changed.length - 1] ^= 1;fs.writeFileSync(file, changed);
        expect(() => readRecordings(directory)).toThrow(/digest/i);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
