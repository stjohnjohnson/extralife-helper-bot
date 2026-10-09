const { buildThemeCatalog, buildThemeLayout } = require('../src/streamAvatars/themeLayout');
const { sceneLayout } = require('../scripts/artwork/composition');
const sha = 'a'.repeat(64);
const { candidate } = require('./fixtures/themeCandidates');
test('empty production catalog cannot render unapproved candidates', () => {
    expect(buildThemeCatalog().themes).toEqual({});
    expect(() => buildThemeCatalog({ manifest: candidate() })).toThrow(/promotion/);
});
test('portable candidate revision binds semantic IDs, geometry and image hashes, excludes machine paths', () => {
    const manifest = candidate(); const first = buildThemeCatalog({ manifest, previewOnly: true });
    expect(first.packRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toMatchObject({ previewOnly: true, profile: { referenceWidth: 1920, bandHeight: 120, baselineOffset: 4 } });
    manifest.assets[Object.keys(manifest.assets)[0]].imagePath = '/different/private.png';
    manifest.packRevision = 'another-local-label';
    expect(buildThemeCatalog({ manifest, previewOnly: true }).packRevision).toBe(first.packRevision);
    manifest.assets[Object.keys(manifest.assets)[0]].sha256 = 'b'.repeat(64);
    expect(buildThemeCatalog({ manifest, previewOnly: true }).packRevision).not.toBe(first.packRevision);
});
test('four whole backdrop tiles and four sparse props share reviewed placement', () => {
    const manifest = candidate(); const catalog = buildThemeCatalog({ manifest, previewOnly: true });
    const theme = catalog.themes['block-world'];
    const layout = buildThemeLayout({ theme, packRevision: catalog.packRevision });
    expect(layout.tiles.map(t => [t.x, t.width])).toEqual([[0, 480], [480, 480], [960, 480], [1440, 480]]);
    expect(layout.props).toHaveLength(4);
    expect(layout.props.reduce((n, p) => n + p.width, 0)).toBeLessThanOrEqual(480);
    const cards = Object.values(manifest.assets).map(a => ({ assetId: a.assetId, brief: { theme: a.theme, kind: a.kind, frame: a.geometry.frame }, validation: { valid: true }, createdAt: '2026-01-01' }));
    expect(layout.props.map(p => [p.id, p.x])).toEqual(sceneLayout(cards).scenery.map(p => [p.assetId, p.previewX]));
    expect(buildThemeLayout({ theme, packRevision: 'b'.repeat(64) })).toEqual(layout);
    expect(buildThemeLayout({ theme: null, packRevision: catalog.packRevision })).toEqual({ tiles: [], props: [] });
});
test.each([0, 1919, 1921, NaN, '1920'])('rejects unsupported reference profile %p rather than inventing edge clipping', referenceWidth => {
    expect(() => buildThemeLayout({ theme: null, packRevision: sha, referenceWidth })).toThrow(/reference/);
});
test.each(['../../escape.png', '/private.png', 'C:\\secret.png', 'folder/../secret.png'])('catalog rejects unsafe export path %s', exportFile => {
    const manifest = candidate(); manifest.assets[Object.keys(manifest.assets)[0]].exportFile = exportFile;
    expect(() => buildThemeCatalog({ manifest, previewOnly: true })).toThrow(/asset/);
});
test('catalog rejects unknown IDs and oversized geometry', () => {
    const manifest = candidate(); const asset = manifest.assets[Object.keys(manifest.assets)[1]];
    asset.geometry.frame.width = 500;
    expect(() => buildThemeCatalog({ manifest, previewOnly: true })).toThrow(/geometry/);
    asset.geometry.frame.width = 96; asset.theme = 'remote-theme';
    expect(() => buildThemeCatalog({ manifest, previewOnly: true })).toThrow(/asset/);
});

test('catalog refuses incomplete worlds and excess props instead of partial promotion', () => {
    const manifest = candidate(); const asset = Object.values(manifest.assets).find(a => a.kind === 'scenery');
    manifest.assets['block-world.scenery.extra'] = { ...asset, assetId: 'block-world.scenery.extra' };
    expect(() => buildThemeCatalog({ manifest, previewOnly: true })).toThrow(/four props/);
    delete manifest.assets['block-world.scenery.extra']; delete manifest.assets[asset.assetId];
    expect(() => buildThemeCatalog({ manifest, previewOnly: true })).toThrow(/four props/);
});
test('wire revision ignores export relocation but binds anchor geometry', () => {
    const manifest = candidate(); const first = buildThemeCatalog({ manifest, previewOnly: true });
    const asset = Object.values(manifest.assets).find(a => a.kind === 'scenery');
    asset.exportFile = 'relocated/sprite.png';
    expect(buildThemeCatalog({ manifest, previewOnly: true }).packRevision).toBe(first.packRevision);
    asset.geometry.anchor.y -= 1;
    expect(buildThemeCatalog({ manifest, previewOnly: true }).packRevision).not.toBe(first.packRevision);
});
