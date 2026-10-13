const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { buildPackage } = require('../src/streamAvatars/package');
const { loadThemePack } = require('../src/streamAvatars/themeRelease');
const { resolveIntegrationPack } = require('../src/streamAvatars/integrationPack');
const { parseStreamAvatarsConfiguration } = require('../src/streamAvatars/config');
const { THEME_IDS } = require('../src/streamAvatars/themes');
const directory = path.resolve(__dirname, '../integrations/stream-avatars/themes/bundled');
test('normal packaging ships all scenery and campaign images without an external theme pack', () => {
    expect(buildPackage().imageCount).toBe(54);
});
test('the tracked default pack supplies six complete worlds with exact source checksums', () => {
    const { catalog, manifest, provenance } = loadThemePack({ directory });
    expect(catalog.previewOnly).toBe(false);
    expect(Object.keys(catalog.themes).sort()).toEqual([...THEME_IDS].sort());
    expect(Object.keys(manifest.assets)).toHaveLength(30);
    for (const [id, asset] of Object.entries(manifest.assets)) {
        const bytes = fs.readFileSync(path.join(directory, asset.exportFile));
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
        expect(['backdrop', 'scenery']).toContain(asset.kind);
        expect(provenance.assets[id]).not.toHaveProperty('importProof');
    }
});
test('integration all/themes resolve the shipped pack independently of ignored review state', () => {
    expect(resolveIntegrationPack({ required: true })).toMatchObject({ themePackDir: directory, candidatePackDir: undefined });
});
test('theme configuration is static and requires neither retired environment variable', () => {
    const settings = { STREAM_AVATARS_ENABLED: 'true', STREAM_AVATARS_TOKEN: 't'.repeat(32) };
    const normal = parseStreamAvatarsConfiguration(settings);
    expect(normal.config.themes.enabled).toBe(true);
    expect(normal.config).not.toHaveProperty('themePackDir');
    expect(parseStreamAvatarsConfiguration({ ...settings, STREAM_AVATARS_THEME_CONFIG: '/missing/secret', STREAM_AVATARS_THEME_PACK: 'https://invalid.test/pack' })).toEqual(normal);
});
test('container includes the same checked-in imagery and mappings used by the bot', () => {
    const docker = fs.readFileSync(path.resolve(__dirname, '../Dockerfile'), 'utf8');
    expect(docker).toMatch(/COPY[^\n]*integrations\/stream-avatars/);
});

test('copying bundled metadata outside the repository does not bypass external native proofs', () => {
    const temporary = fs.mkdtempSync(path.join(fs.realpathSync(require('node:os').tmpdir()), 'sa-external-bundle-'));
    try {
        fs.cpSync(directory, temporary, { recursive: true });
        expect(() => loadThemePack({ directory: temporary })).toThrow('Exact selection/native proof binding required');
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
