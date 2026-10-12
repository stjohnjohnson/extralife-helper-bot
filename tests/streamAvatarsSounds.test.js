const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { unzipSync } = require('fflate');
const { buildPackage } = require('../src/streamAvatars/package');

const shipped = path.resolve(__dirname, '../integrations/stream-avatars');
const names = ['sa_donation', 'sa_milestone', 'sa_goal'];

describe('bundled celebration sounds', () => {
    let directory, integrationDir;
    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sa sounds '));
        integrationDir = path.join(directory, 'integration');
        fs.cpSync(shipped, integrationDir, { recursive: true });
    });
    afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

    function changeCatalog(change) {
        const file = path.join(integrationDir, 'sounds/catalog.json');
        const catalog = JSON.parse(fs.readFileSync(file));
        change(catalog);
        fs.writeFileSync(file, JSON.stringify(catalog));
    }

    test.each([
        ['name', '../private'], ['name', 'CON'], ['file', '../companion.lua'], ['file', 'private.mp3'],
        ['sha256', 'not-a-digest'], ['name', ''], ['file', 'CON.ogg']
    ])('rejects invalid sound %s %s before packaging', (field, value) => {
        changeCatalog(catalog => { catalog[0][field] = value; });
        expect(() => buildPackage({ integrationDir })).toThrow(/sound|catalog/i);
    });

    test('rejects duplicate names ignoring case and missing required cue names', () => {
        changeCatalog(catalog => { catalog[1].name = 'SA_DONATION'; });
        expect(() => buildPackage({ integrationDir })).toThrow(/duplicate/i);
        fs.copyFileSync(path.join(shipped, 'sounds/catalog.json'), path.join(integrationDir, 'sounds/catalog.json'));
        changeCatalog(catalog => { catalog.pop(); });
        expect(() => buildPackage({ integrationDir })).toThrow(/sa_goal/);
    });

    test('rejects symlinked sound directories and files', () => {
        const file = path.join(integrationDir, 'sounds/sa_donation.ogg');
        fs.unlinkSync(file);
        fs.symlinkSync(path.join(shipped, 'sounds/sa_donation.ogg'), file);
        expect(() => buildPackage({ integrationDir })).toThrow(/regular file/);
        fs.rmSync(path.join(integrationDir, 'sounds'), { recursive: true });
        fs.symlinkSync(path.join(shipped, 'sounds'), path.join(integrationDir, 'sounds'));
        expect(() => buildPackage({ integrationDir })).toThrow(/directory/);
    });

    test.each(['corrupt', 'truncated', 'wrong-codec', 'empty', 'oversize'])('rejects %s audio even with an updated digest', mode => {
        const file = path.join(integrationDir, 'sounds/sa_donation.ogg');
        let bytes = fs.readFileSync(file);
        if (mode === 'corrupt') bytes[bytes.length - 20] ^= 1;
        if (mode === 'truncated') bytes = bytes.subarray(0, bytes.length - 1);
        if (mode === 'wrong-codec') bytes = Buffer.from('OggSOpusHead');
        if (mode === 'empty') bytes = Buffer.alloc(0);
        if (mode === 'oversize') bytes = Buffer.alloc(4 * 1024 * 1024 + 1);
        fs.writeFileSync(file, bytes);
        changeCatalog(catalog => { catalog[0].sha256 = createHash('sha256').update(bytes).digest('hex'); });
        expect(() => buildPackage({ integrationDir })).toThrow(/Ogg|Vorbis|size/i);
    });

    test('detects changed audio by digest and malformed or excessive catalogs', () => {
        changeCatalog(catalog => { catalog[0].sha256 = '0'.repeat(64); });
        expect(() => buildPackage({ integrationDir })).toThrow(/digest/i);
        fs.writeFileSync(path.join(integrationDir, 'sounds/catalog.json'), '{');
        expect(() => buildPackage({ integrationDir })).toThrow(/JSON/);
        fs.writeFileSync(path.join(integrationDir, 'sounds/catalog.json'), JSON.stringify(Array(17).fill({})));
        expect(() => buildPackage({ integrationDir })).toThrow(/catalog/i);
    });

    test('the same catalog builds byte-identical packages including audio', () => {
        const first = buildPackage({ integrationDir }).archive;
        fs.utimesSync(path.join(integrationDir, 'sounds/sa_goal.ogg'), new Date(0), new Date());
        expect(buildPackage({ integrationDir }).archive).toEqual(first);
    });

    test('ships each cue in the importable script folder and excludes unrelated files', () => {
        fs.mkdirSync(path.join(integrationDir, 'sounds'), { recursive: true });
        fs.writeFileSync(path.join(integrationDir, 'sounds/private.txt'), 'PRIVATE_SOUND_SENTINEL');
        const result = buildPackage({ integrationDir });
        const entries = unzipSync(result.archive);
        expect(result.soundCount).toBe(3);
        for (const name of names) {
            expect(Buffer.from(entries[`scripts/sa_helper_bridge/sounds/${name}.ogg`]))
                .toEqual(fs.readFileSync(path.join(integrationDir, 'sounds', `${name}.ogg`)));
        }
        expect(Object.keys(entries).some(name => name.includes('private') || name.startsWith('sounds/'))).toBe(false);
        const settings = JSON.parse(Buffer.from(entries['scripts/sa_helper_bridge/sa_helper_bridge_settings.json']));
        expect(settings.sounds).toEqual({ donation: 'sa_donation', milestone: 'sa_milestone', goal: 'sa_goal' });
    });

    test('CLI exposes the bundled audio beside the ZIP for one-time native sound import', () => {
        const output = path.join(directory, 'output with spaces', 'bridge.zip');
        const result = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/sa-package.js'), '--output', output], { cwd: directory, encoding: 'utf8' });
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('3 sounds');
        for (const name of names) expect(fs.readFileSync(path.join(directory, 'output with spaces/sounds', `${name}.ogg`)))
            .toEqual(fs.readFileSync(path.join(shipped, 'sounds', `${name}.ogg`)));
    });
});
