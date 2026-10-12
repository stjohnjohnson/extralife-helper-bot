const { createHash } = require('node:crypto');
const { THEME_IDS } = require('./themes');
const PROFILE = Object.freeze({ referenceWidth: 1920, bandHeight: 120, baselineOffset: 4 });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const revision = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
// Shared with the review gallery: stable by theme + asset ID, never game name or arrival order.
function propPosition(themeId, id, width, index, count, referenceWidth = 1920) {
    let seed = 0;
    for (const char of `${themeId}:${id}`) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0;
    return Math.max(0, Math.min(referenceWidth - width, Math.round(referenceWidth * (index + 1) / (count + 1) - width / 2 + (seed % 101) - 50)));
}
function buildThemeLayout({ theme, packRevision, referenceWidth = 1920 }) {
    if (referenceWidth !== 1920) throw new Error('Unsupported theme reference width');
    if (!revision(packRevision)) throw new Error('Invalid theme pack revision');
    if (!theme) return { tiles: [], props: [] };
    const tiles = theme.backdrop ? Array.from({ length: 4 }, (_, i) => ({ ...theme.backdrop, x: i * 480 })) : [];
    const props = theme.props.map((asset, index) => ({ ...asset, x: propPosition(theme.themeId, asset.id, asset.width, index, theme.props.length, referenceWidth) }));
    return { tiles, props };
}
function buildThemeCatalog({ manifest, previewOnly = false } = {}) {
    // Production promotion belongs to the selected-artifact/proof gate. Booleans in an arbitrary
    // candidate manifest are never approval. Normal defaults load the checked-in bundled pack.
    if (manifest && previewOnly !== true) throw new Error('Theme production promotion is required');
    const assets = [];
    if (manifest) {
        if (!manifest.assets || typeof manifest.assets !== 'object' || Array.isArray(manifest.assets)) throw new Error('Invalid theme assets');
        for (const [id, source] of Object.entries(manifest.assets).sort(([a], [b]) => a.localeCompare(b))) {
            if (!source || !THEME_IDS.includes(source.theme) || !['scenery', 'backdrop'].includes(source.kind) ||
                source.assetId !== id || !new RegExp(`^${source.theme}\\.${source.kind}\\.[a-z0-9-]+$`).test(id) || !revision(source.sha256)) throw new Error('Invalid theme asset');
            if (typeof source.exportFile !== 'string' || !/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*\.png$/.test(source.exportFile) || source.exportFile.split('/').some(part => part === '..' || part === '.')) throw new Error('Invalid theme asset path');
            const frame = source.geometry?.frame; const anchor = source.geometry?.anchor;
            if (!frame || !anchor || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width < 1 || frame.height < 1 || frame.height > 120 ||
                (source.kind === 'backdrop' ? frame.width !== 480 || frame.height !== 64 : frame.width > 120) ||
                !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) || anchor.x < 0 || anchor.x > frame.width || anchor.y < 0 || anchor.y > frame.height) throw new Error('Invalid theme geometry');
            assets.push({ id, themeId: source.theme, kind: source.kind, image: `sa_${id.replaceAll('.', '_').replaceAll('-', '_')}`, width: frame.width, height: frame.height,
                anchorX: anchor.x, anchorY: anchor.y, sha256: source.sha256, exportFile: source.exportFile });
        }
    }
    const themes = {};
    for (const themeId of THEME_IDS) {
        const selected = assets.filter(a => a.themeId === themeId);
        const props = selected.filter(a => a.kind === 'scenery'); const backdrops = selected.filter(a => a.kind === 'backdrop');
        if (!selected.length) continue;
        if (props.length !== 4 || backdrops.length !== 1 || props.reduce((n, a) => n + a.width, 0) > 480) throw new Error('Invalid theme geometry: four props and one backdrop required');
        const portable = asset => { const value = { ...asset }; delete value.exportFile; return value; };
        themes[themeId] = { themeId, backdrop: portable(backdrops[0]), props: props.map(portable) };
    }
    const packRevision = hash({ profile: PROFILE, themes });
    return { schemaVersion: 1, previewOnly: manifest ? true : false, profile: { ...PROFILE }, packRevision, themes, assets };
}
module.exports = { buildThemeCatalog, buildThemeLayout, propPosition };
