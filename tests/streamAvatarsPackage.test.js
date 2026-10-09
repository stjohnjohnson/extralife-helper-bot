const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { unzipSync, strFromU8 } = require('fflate');
const { crc32 } = require('node:zlib');
const { PNG } = require('pngjs');
const { buildPackage } = require('../src/streamAvatars/package');

const shipped = path.resolve(__dirname, '../integrations/stream-avatars');
const commandPath = 'scripts/sa_helper_bridge/';
const manifest = JSON.parse(fs.readFileSync(path.join(shipped, 'assets/heart.json'), 'utf8'));
const decode = archive => unzipSync(archive);
const json = (entries, name) => JSON.parse(strFromU8(entries[name]));

describe('portable Stream Avatars packages', () => {
    let directory, integrationDir;
    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sa package '));
        integrationDir = path.join(directory, 'integration');
        fs.cpSync(shipped, integrationDir, { recursive: true });
    });
    afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

    function changeManifest(changes) {
        fs.writeFileSync(path.join(integrationDir, 'assets/heart.json'), JSON.stringify({ ...manifest, ...changes }));
    }

    test('contains the shipped script, placeholder settings, and native looping animation metadata', () => {
        const result = buildPackage({ integrationDir });
        const entries = decode(result.archive);
        expect(result.imageCount).toBe(1);
        expect(Object.keys(entries).sort()).toEqual([
            'data.txt', `${commandPath}sa_heart.png`, `${commandPath}sa_helper_bridge.lua`, `${commandPath}sa_helper_bridge_settings.json`
        ].sort());
        expect(Buffer.from(entries[`${commandPath}sa_helper_bridge.lua`])).toEqual(fs.readFileSync(path.join(shipped, 'companion.lua')));
        expect(Buffer.from(entries[`${commandPath}sa_heart.png`])).toEqual(fs.readFileSync(path.join(shipped, 'assets/heart.png')));
        const data = json(entries, 'data.txt');
        expect(Object.keys(data).sort()).toEqual(['avatar', 'gear', 'backgrounds', 'backgroundObj', 'boss', 'playerClass', 'nametags', 'commands', 'languages'].sort());
        expect(Object.keys(data.commands)).toEqual(['sa_helper_bridge']);
        expect(data.commands.sa_helper_bridge).toMatchObject({
            name: 'sa_helper_bridge', scriptName: 'sa_helper_bridge', enabled: true,
            advancedSettings: true, runMode: 1, restrictionType: 0,
            scriptImages: { sa_heart: {
                imageName: 'sa_heart.png', width: 32, height: 32, originX: 0.5, originY: 0.5, scale: 1,
                details: { fps: 12, fpsPerFrame: Array(8).fill(12), loopTotal: 61, actionFrame: -1, usesColor: true }
            } }
        });
        expect(json(entries, `${commandPath}sa_helper_bridge_settings.json`)).toEqual({
            address: 'BOT_LAN_IP', token: 'REPLACE_WITH_PRIVATE_TOKEN'
        });
    });

    test('automatically includes new manifests with independent FPS and looping', () => {
        fs.writeFileSync(path.join(integrationDir, 'assets/second.json'), JSON.stringify({ ...manifest, name: 'sa_second', framesPerSecond: 24, loop: false }));
        const result = buildPackage({ integrationDir });
        const entries = decode(result.archive);
        expect(result.imageCount).toBe(2);
        expect(entries[`${commandPath}sa_second.png`]).toEqual(entries[`${commandPath}sa_heart.png`]);
        expect(json(entries, 'data.txt').commands.sa_helper_bridge.scriptImages.sa_second.details)
            .toMatchObject({ fps: 24, fpsPerFrame: Array(8).fill(24), loopTotal: 1 });
    });

    test('builds byte-identical ZIPs despite source modification times and creation order', () => {
        const first = buildPackage({ integrationDir }).archive;
        fs.utimesSync(path.join(integrationDir, 'assets/heart.png'), new Date(0), new Date());
        expect(buildPackage({ integrationDir }).archive).toEqual(first);
        fs.writeFileSync(path.join(integrationDir, 'assets/z.json'), JSON.stringify({ ...manifest, name: 'sa_z' }));
        fs.writeFileSync(path.join(integrationDir, 'assets/a.json'), JSON.stringify({ ...manifest, name: 'sa_a' }));
        const ordered = buildPackage({ integrationDir }).archive;
        const content = fs.readFileSync(path.join(integrationDir, 'assets/a.json'));
        fs.unlinkSync(path.join(integrationDir, 'assets/a.json'));
        fs.writeFileSync(path.join(integrationDir, 'assets/a.json'), content);
        expect(buildPackage({ integrationDir }).archive).toEqual(ordered);
    });

    test('ignores private files and environment credentials and emits only allowed placeholder settings', () => {
        const secret = 'PRIVATE_SENTINEL_DO_NOT_PACKAGE';
        fs.writeFileSync(path.join(integrationDir, '.env'), `STREAM_AVATARS_TOKEN=${secret}`);
        fs.writeFileSync(path.join(integrationDir, 'settings.local.json'), JSON.stringify({ token: secret }));
        fs.writeFileSync(path.join(integrationDir, 'companion.json'), secret);
        fs.writeFileSync(path.join(integrationDir, 'assets/private.txt'), secret);
        const settings = JSON.parse(fs.readFileSync(path.join(integrationDir, 'settings.example.json')));
        fs.writeFileSync(path.join(integrationDir, 'settings.example.json'), JSON.stringify({ ...settings, token: secret, url: 'ws://private:1234/', injected: secret }));
        const entries = decode(buildPackage({ integrationDir }).archive);
        for (const value of Object.values(entries)) expect(strFromU8(value)).not.toContain(secret);
        expect(json(entries, `${commandPath}sa_helper_bridge_settings.json`)).not.toHaveProperty('injected');
    });

    test.each([
        [{ name: '../escape' }, 'name'], [{ name: 'CON' }, 'name'], [{ file: '../settings.local.json' }, 'file'],
        [{ file: 'C:\\private.png' }, 'file'], [{ frameWidth: 0 }, 'frameWidth'], [{ frameHeight: 1.5 }, 'frameHeight'],
        [{ frames: 0 }, 'frames'], [{ rows: 3 }, 'rows'], [{ framesPerSecond: 0 }, 'framesPerSecond'],
        [{ framesPerSecond: '12' }, 'framesPerSecond'], [{ loop: 'true' }, 'loop'], [{ transparent: 'true' }, 'transparent'],
        [{ frames: 9 }, 'dimensions'], [{ frameWidth: 64 }, 'dimensions']
    ])('rejects invalid manifest %j', (changes, message) => {
        changeManifest(changes);
        expect(() => buildPackage({ integrationDir })).toThrow(message);
    });

    test('rejects duplicate image names regardless of case', () => {
        fs.writeFileSync(path.join(integrationDir, 'assets/duplicate.json'), JSON.stringify({ ...manifest, name: 'SA_HEART' }));
        expect(() => buildPackage({ integrationDir })).toThrow(/duplicate/i);
    });

    test('rejects malformed JSON with a useful manifest filename', () => {
        fs.writeFileSync(path.join(integrationDir, 'assets/heart.json'), '{');
        expect(() => buildPackage({ integrationDir })).toThrow(/heart.json.*JSON/);
    });

    test('requires the heart image used by the shipped companion', () => {
        changeManifest({ name: 'some_other_image' });
        expect(() => buildPackage({ integrationDir })).toThrow(/sa_heart/);
    });

    test('includes manifests with an uppercase extension on every OS', () => {
        fs.renameSync(path.join(integrationDir, 'assets/heart.json'), path.join(integrationDir, 'assets/heart.JSON'));
        expect(buildPackage({ integrationDir }).imageCount).toBe(1);
    });

    test('rejects corrupt or truncated PNG chunks', () => {
        const original = fs.readFileSync(path.join(integrationDir, 'assets/heart.png'));
        const corrupt = Buffer.from(original);
        corrupt[20] ^= 1;
        fs.writeFileSync(path.join(integrationDir, 'assets/heart.png'), corrupt);
        expect(() => buildPackage({ integrationDir })).toThrow(/PNG/);
        fs.writeFileSync(path.join(integrationDir, 'assets/heart.png'), original.subarray(0, original.length - 12));
        expect(() => buildPackage({ integrationDir })).toThrow(/PNG/);
    });

    test.each([24, 25, 26, 27, 28])('rejects invalid PNG header byte %i even with a valid checksum', byteOffset => {
        const file = path.join(integrationDir, 'assets/heart.png');
        const bytes = fs.readFileSync(file);
        bytes[byteOffset] = byteOffset === 24 ? 0 : byteOffset === 28 ? 2 : 1;
        bytes.writeUInt32BE(crc32(bytes.subarray(12, 29)), 29);
        fs.writeFileSync(file, bytes);
        expect(() => buildPackage({ integrationDir })).toThrow(/PNG/);
    });

    test('rejects invalid PNG pixel compression even with valid chunk checksums', () => {
        const file = path.join(integrationDir, 'assets/heart.png');
        const bytes = fs.readFileSync(file);
        let offset = 8;
        while (bytes.toString('ascii', offset + 4, offset + 8) !== 'IDAT') offset += bytes.readUInt32BE(offset) + 12;
        const length = bytes.readUInt32BE(offset);
        bytes[offset + 8] = 0;
        bytes.writeUInt32BE(crc32(bytes.subarray(offset + 4, offset + 8 + length)), offset + 8 + length);
        fs.writeFileSync(file, bytes);
        expect(() => buildPackage({ integrationDir })).toThrow(/PNG/);
    });

    test('supports multi-row sheets and fractional FPS without changing image bytes', () => {
        const png = PNG.sync.write({ width: 128, height: 64, data: Buffer.alloc(128 * 64 * 4) });
        fs.writeFileSync(path.join(integrationDir, 'assets/heart.png'), png);
        changeManifest({ rows: 2, framesPerSecond: 12.5 });
        const entries = decode(buildPackage({ integrationDir }).archive);
        expect(Buffer.from(entries[`${commandPath}sa_heart.png`])).toEqual(png);
        expect(json(entries, 'data.txt').commands.sa_helper_bridge.scriptImages.sa_heart.details.fpsPerFrame).toEqual(Array(8).fill(12.5));
    });

    test('refuses symlink manifests before reading them', () => {
        const external = path.join(directory, 'private.json');
        fs.writeFileSync(external, JSON.stringify(manifest));
        fs.unlinkSync(path.join(integrationDir, 'assets/heart.json'));
        fs.symlinkSync(external, path.join(integrationDir, 'assets/heart.json'));
        expect(() => buildPackage({ integrationDir })).toThrow(/regular file/);
    });

    test('derives heart dimensions from the manifest without exposing geometry in settings', () => {
        const png = PNG.sync.write({ width: 512, height: 64, data: Buffer.alloc(512 * 64 * 4) });
        fs.writeFileSync(path.join(integrationDir, 'assets/heart.png'), png);
        changeManifest({ frameWidth: 64, frameHeight: 64 });
        const entries = decode(buildPackage({ integrationDir }).archive);
        expect(strFromU8(entries[`${commandPath}sa_helper_bridge.lua`])).toContain('local HEART_WIDTH, HEART_HEIGHT = 64, 64');
        expect(Object.keys(json(entries, `${commandPath}sa_helper_bridge_settings.json`)).sort()).toEqual(['address', 'token']);
    });

    test('rejects an empty catalog and missing or invalid PNGs', () => {
        fs.unlinkSync(path.join(integrationDir, 'assets/heart.png'));
        expect(() => buildPackage({ integrationDir })).toThrow(/heart.png/);
        fs.writeFileSync(path.join(integrationDir, 'assets/heart.png'), 'not a PNG');
        expect(() => buildPackage({ integrationDir })).toThrow(/PNG/);
        fs.unlinkSync(path.join(integrationDir, 'assets/heart.json'));
        expect(() => buildPackage({ integrationDir })).toThrow(/manifest/i);
    });

    test('rejects image symlinks to files outside the catalog', () => {
        const external = path.join(directory, 'private.png');
        fs.copyFileSync(path.join(integrationDir, 'assets/heart.png'), external);
        fs.unlinkSync(path.join(integrationDir, 'assets/heart.png'));
        fs.symlinkSync(external, path.join(integrationDir, 'assets/heart.png'));
        expect(() => buildPackage({ integrationDir })).toThrow(/regular file/);
    });

    test('CLI produces a ZIP at a path with spaces without relying on the working directory or environment', () => {
        const output = path.join(directory, 'output with spaces', 'bridge.zip');
        const result = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/sa-package.js'), '--output', output], {
            cwd: directory, encoding: 'utf8', env: { ...process.env, STREAM_AVATARS_TOKEN: 'PRIVATE_CLI_SENTINEL' }
        });
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('1 image');
        expect(result.stdout).toContain(output);
        const entries = decode(fs.readFileSync(output));
        expect(json(entries, `${commandPath}sa_helper_bridge_settings.json`).token).toBe('REPLACE_WITH_PRIVATE_TOKEN');
    });

    test.each([['--unknown'], ['--output'], ['--output', 'no-extension'], ['--output', 'a.zip', 'extra']])('CLI rejects invalid arguments %j', (...args) => {
        const result = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/sa-package.js'), ...args], { cwd: directory, encoding: 'utf8' });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('Usage:');
        expect(fs.existsSync(path.join(directory, 'no-extension'))).toBe(false);
    });
});
