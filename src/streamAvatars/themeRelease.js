// Local portable packs are produced by the artwork selection/proof gate, never from network input.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { buildThemeCatalog } = require('./themeLayout');
const inventory = require('../../integrations/stream-avatars/artwork/inventory.json');
const digest = value => createHash('sha256').update(value).digest('hex');
const jsonHash = value => digest(JSON.stringify(value));
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function localPath(directory, relative = '') {
    if (typeof directory !== 'string' || !directory || directory.startsWith('\\\\') || /^[a-z]+:\/\//i.test(directory)) throw new Error('Local pack directory required');
    if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).some(p => p === '..')) throw new Error('Pack path escape');
    const file = path.resolve(directory, relative);
    let current = path.parse(file).root;
    for (const part of file.slice(current.length).split(path.sep)) {
        current = path.join(current, part);
        try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Symlink pack path escape'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return file;
}
function loadThemePack({ directory, previewOnly = false }) {
    const read = name => JSON.parse(fs.readFileSync(localPath(directory, name), 'utf8'));
    const stored = read('catalog.json'); const provenance = read('provenance.json'); const manifest = read('manifest.json');
    if (stored.schemaVersion !== 1 || typeof stored.previewOnly !== 'boolean' || stored.rehearsalOnly !== stored.previewOnly || provenance.schemaVersion !== 1 || provenance.previewOnly !== stored.previewOnly || !object(provenance.assets)) throw new Error('Invalid portable pack');
    if (stored.previewOnly && !previewOnly) throw new Error('Candidate pack requires explicit rehearsal preview');
    const ids = inventory.assets.map(a => a.id).sort();
    if (!object(manifest.assets) || JSON.stringify(Object.keys(manifest.assets).sort()) !== JSON.stringify(ids) || JSON.stringify(Object.keys(provenance.assets).sort()) !== JSON.stringify(ids)) throw new Error('Complete 30-design scenery pack required');
    for (const id of ids) {
        const asset = manifest.assets[id]; const proof = provenance.assets[id];
        if (proof.assetId !== id || proof.attemptId !== asset.attemptId || proof.sha256 !== asset.sha256 || !hex(proof.recipeHash) || !hex(proof.sourceSha256) || !hex(proof.promptSha256) || !Array.isArray(proof.referenceSha256) || !proof.referenceSha256.every(hex)) throw new Error('Portable provenance checksum mismatch');
        const importName = 'sa_' + id.replaceAll('.', '_').replaceAll('-', '_');
        if (!stored.previewOnly && (typeof proof.selectionId !== 'string' || !proof.selectionId || proof.approved !== true || !object(proof.importProof) || proof.importProof.attemptId !== proof.attemptId || proof.importProof.sha256 !== proof.sha256 || proof.importProof.importedAndProven !== true || proof.importProof.importName !== importName || !hex(proof.importProof.evidenceSha256))) throw new Error('Exact selection/native proof binding required');
        const bytes = fs.readFileSync(localPath(directory, asset.exportFile));
        if (digest(bytes) !== asset.sha256) throw new Error('Pack image checksum mismatch');
    }
    const catalog = { ...buildThemeCatalog({ manifest, previewOnly: true }), previewOnly: stored.previewOnly, rehearsalOnly: stored.previewOnly };
    if (jsonHash(catalog) !== jsonHash(stored) || provenance.packRevision !== catalog.packRevision || provenance.manifestSha256 !== jsonHash(manifest)) throw new Error('Portable catalog/provenance revision mismatch');
    return { catalog, provenance, manifest, packRevision: catalog.packRevision };
}
module.exports = { loadThemePack, localPath, jsonHash };
