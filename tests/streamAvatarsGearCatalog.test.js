const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { unzipSync, strFromU8 } = require('fflate');
const { PNG } = require('pngjs');
const { buildThemeCatalog } = require('../src/streamAvatars/themeLayout');
const { buildPackage } = require('../src/streamAvatars/package');
const { candidate } = require('./fixtures/themeCandidates');
const { HATS, SET_NAME } = require('../src/streamAvatars/gearCompatibility');
function fixture() {
    const manifest = candidate();
    for (const h of HATS['block-world']) manifest.assets[h.assetId] = { assetId: h.assetId, theme: 'block-world', kind: 'gear', gearSlot: 'head', sha256: 'a'.repeat(64), exportFile: h.pieceName + '.png', geometry: { frame: { width: 32, height: 32 }, anchor: { x: 16, y: 30 } } };
    const compatibility = { schemaVersion: 1, setName: SET_NAME, provisional: true, graphicsVerified: false, avatars: { small: { 'block-world': { slot: 'head', primary: { setName: SET_NAME, pieceName: HATS['block-world'][0].pieceName }, alternate: { setName: SET_NAME, pieceName: HATS['block-world'][1].pieceName }, fitRevision: 'b'.repeat(64) } } } };
    return { manifest, compatibility };
}
test('default production has no fake fitting support; explicit compatibility binds catalog revision', () => {
    expect(buildThemeCatalog().gear.avatars).toEqual({});
    const { manifest, compatibility } = fixture(); const first = buildThemeCatalog({ manifest, gearCompatibility: compatibility, previewOnly: true });
    expect(first.assets.filter(a => a.kind === 'gear')).toHaveLength(2); expect(first.gear.avatars.small['block-world'].slot).toBe('head');
    compatibility.avatars.small['block-world'].fitRevision = 'c'.repeat(64);
    expect(buildThemeCatalog({ manifest, gearCompatibility: compatibility, previewOnly: true }).packRevision).not.toBe(first.packRevision);
    manifest.assets[HATS['block-world'][0].assetId].sha256 = 'd'.repeat(64);
    expect(buildThemeCatalog({ manifest, previewOnly: true }).packRevision).not.toBe(buildThemeCatalog({ manifest: fixture().manifest, previewOnly: true }).packRevision);
    expect(() => buildThemeCatalog({ gearCompatibility: compatibility })).toThrow(/promotion/);
});
test.each(['body', 'foreign', 'goggles', 'missing-image', 'bad-fit'])('catalog rejects unsupported gear %s', defect => {
    const { manifest, compatibility } = fixture(); const fit = compatibility.avatars.small['block-world'];
    if (defect === 'body') fit.slot = 'back';
    if (defect === 'foreign') fit.primary.setName = 'foreign';
    if (defect === 'goggles') fit.primary.pieceName = 'puzzle_gear_technician_goggles';
    if (defect === 'missing-image') delete manifest.assets[HATS['block-world'][0].assetId];
    if (defect === 'bad-fit') fit.fitRevision = 'pending';
    expect(() => buildThemeCatalog({ manifest, gearCompatibility: compatibility, previewOnly: true })).toThrow();
});
test('rejects retired and non-head candidate designs even with no fitted avatars', () => {
    const { manifest } = fixture(); const hat = manifest.assets[HATS['block-world'][0].assetId]; hat.gearSlot = 'face';
    expect(() => buildThemeCatalog({ manifest, previewOnly: true })).toThrow(/hat/);
    delete manifest.assets[hat.assetId]; hat.assetId = 'block-world.gear.goggles'; hat.gearSlot = 'head'; manifest.assets[hat.assetId] = hat;
    expect(() => buildThemeCatalog({ manifest, previewOnly: true })).toThrow(/hat/);
});
test('native gear-only packaging contains own namespace images and no private avatar metadata', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-native-gear-'));
    try {
        const { manifest, compatibility } = fixture();
        for (const a of Object.values(manifest.assets)) { const { width, height } = a.geometry.frame; const bytes = PNG.sync.write({ width, height, data: Buffer.alloc(width * height * 4) }); fs.writeFileSync(path.join(directory, a.exportFile), bytes); a.sha256 = createHash('sha256').update(bytes).digest('hex'); }
        const result = buildPackage({ themeManifest: manifest, gearCompatibility: compatibility, themeAssetsDir: directory, previewOnly: true });
        const entries = unzipSync(result.archive); const data = JSON.parse(strFromU8(entries['data.txt']));
        expect(result.imageCount).toBe(29); expect(data.avatar).toEqual({}); expect(Object.keys(data.gear)).toEqual([SET_NAME]);
        const pieces = data.gear[SET_NAME].gearPiece;
        expect(Object.keys(pieces)).toEqual(HATS['block-world'].map(h => h.pieceName).sort());
        expect(pieces[HATS['block-world'][0].pieceName]).toMatchObject({ setName: SET_NAME, pieceName: HATS['block-world'][0].pieceName, width: 32, height: 32, PPU: 1, isAnimated: false, flipsWithAvatarX: true });
        expect(entries[`gear/${SET_NAME}/${HATS['block-world'][0].pieceName}.png`]).toBeDefined();
        const script = strFromU8(entries['scripts/sa_helper_bridge/sa_helper_bridge.lua']); const embedded = JSON.parse(script.match(/local THEME_CATALOG_JSON = \[\[([^]*?)\]\]/)[1]);
        expect(embedded.gear.avatars.small['block-world'].primary.pieceName).toBe(HATS['block-world'][0].pieceName);
        expect(script).not.toMatch(/PRIVATE_MACHINE|userrecords|imagePath/);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('rejects prototype property avatar keys rather than changing portable map ownership', () => {
    const { manifest, compatibility } = fixture();
    compatibility.avatars = JSON.parse(JSON.stringify(compatibility.avatars).replace('"small"', '"__proto__"'));
    expect(() => buildThemeCatalog({ manifest, gearCompatibility: compatibility, previewOnly: true })).toThrow(/avatar/);
});
