const sha = 'a'.repeat(64);
function candidate() {
    const assets = {};
    for (const [name, kind, width, height] of [['base', 'backdrop', 480, 64], ['one', 'scenery', 96, 64], ['two', 'scenery', 64, 64], ['three', 'scenery', 32, 64], ['four', 'scenery', 32, 32]]) {
        const assetId = `block-world.${kind}.${name}`;
        assets[assetId] = { assetId, theme: 'block-world', kind, sha256: sha, exportFile: `${name}.png`, geometry: { frame: { width, height }, anchor: { x: width / 2, y: height - (kind === 'backdrop' ? 0 : 4) } }, imagePath: '/private/secret.png', approved: false };
    }
    return { previewOnly: true, approved: false, packRevision: 'local-review-invalid-wire-revision', assets };
}
module.exports = { candidate };
