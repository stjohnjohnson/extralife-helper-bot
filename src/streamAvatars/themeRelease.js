// Local portable packs are produced by the artwork selection/proof gate, never from network input.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { buildThemeCatalog } = require('./themeLayout');
const { HATS, SET_NAME, validateGearCompatibility } = require('./gearCompatibility');
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
function validateProofs(proofs, choices) {
    if (!object(proofs) || proofs.schemaVersion !== 1 || proofs.setName !== SET_NAME || proofs.graphicsVerified !== true || !object(proofs.pieces)) throw new Error('Native gear proofs required');
    if (proofs.variants !== undefined) throw new Error('Unsupported fitted variants require schema/runtime extension before promotion');
    const gear = validateGearCompatibility(proofs.compatibility);
    if (!Object.keys(gear.avatars).length) throw new Error('Native avatar fit proofs required');
    const hats = Object.values(HATS).flat();
    if (Object.keys(proofs.pieces).length !== hats.length || Object.keys(proofs.pieces).some(name => !hats.some(h => h.pieceName === name))) throw new Error('All twelve canonical hat proofs required; unsupported pieces');
    const pieces = {};
    for (const hat of hats) {
        const proof = proofs.pieces[hat.pieceName]; const choice = choices[hat.assetId];
        if (!proof || !choice || proof.assetId !== hat.assetId || proof.attemptId !== choice.attemptId || proof.sha256 !== choice.sha256 || proof.selectionId !== choice.selectionId ||
            proof.importedAndProven !== true || proof.restorationProven !== true || !hex(proof.evidenceSha256) || !Array.isArray(proof.avatarKeys) || !proof.avatarKeys.length || new Set(proof.avatarKeys).size !== proof.avatarKeys.length ||
            !Array.isArray(proof.actions) || !['idle', 'run', 'jump', 'sit'].every(a => proof.actions.includes(a)) || !Array.isArray(proof.directions) || ![-1, 1].every(d => proof.directions.includes(d))) throw new Error('Missing or stale checksum-bound native hat proof');
        for (const avatar of proof.avatarKeys) {
            const fit = gear.avatars[avatar]?.[hat.assetId.split('.')[0]];
            const geometry = proof.fits?.[avatar];
            if (!fit || ![fit.primary, fit.alternate].some(p => p?.pieceName === hat.pieceName) || !geometry || geometry.fitRevision !== fit.fitRevision ||
                !['x', 'y'].every(k => Number.isFinite(geometry.headPosition?.[k]) && Math.abs(geometry.headPosition[k]) <= 4096 && Number.isFinite(geometry.scale?.[k]) && geometry.scale[k] > 0 && geometry.scale[k] <= 10)) throw new Error('Native head position/scale fit proof mismatch');
        }
        for (const [avatar, fits] of Object.entries(gear.avatars)) {
            const fit = fits[hat.assetId.split('.')[0]];
            if (fit && [fit.primary, fit.alternate].some(p => p?.pieceName === hat.pieceName) && !proof.avatarKeys.includes(avatar)) throw new Error('Unproven compatible avatar');
        }
        // Keep only portable evidence and identifiers, never arbitrary local notes/paths.
        pieces[hat.pieceName] = { assetId: hat.assetId, attemptId: proof.attemptId, sha256: proof.sha256, selectionId: proof.selectionId, importedAndProven: true,
            restorationProven: true, evidenceSha256: proof.evidenceSha256, avatarKeys: [...proof.avatarKeys].sort(), actions: ['idle', 'run', 'jump', 'sit'], directions: [-1, 1],
            fits: Object.fromEntries([...proof.avatarKeys].sort().map(avatar => [avatar, { fitRevision: proof.fits[avatar].fitRevision, headPosition: { x: proof.fits[avatar].headPosition.x, y: proof.fits[avatar].headPosition.y }, scale: { x: proof.fits[avatar].scale.x, y: proof.fits[avatar].scale.y } }])) };
    }
    return { schemaVersion: 1, setName: SET_NAME, graphicsVerified: true, pieces, compatibility: gear };
}
function loadThemePack({ directory, previewOnly = false }) {
    const read = name => JSON.parse(fs.readFileSync(localPath(directory, name), 'utf8'));
    const stored = read('catalog.json'); const provenance = read('provenance.json'); const manifest = read('manifest.json');
    if (stored.schemaVersion !== 1 || typeof stored.previewOnly !== 'boolean' || stored.rehearsalOnly !== stored.previewOnly || provenance.schemaVersion !== 1 || provenance.previewOnly !== stored.previewOnly || !object(provenance.assets)) throw new Error('Invalid portable pack');
    if (stored.previewOnly && !previewOnly) throw new Error('Candidate pack requires explicit rehearsal preview');
    const ids = inventory.assets.map(a => a.id).sort();
    if (!object(manifest.assets) || JSON.stringify(Object.keys(manifest.assets).sort()) !== JSON.stringify(ids) || JSON.stringify(Object.keys(provenance.assets).sort()) !== JSON.stringify(ids)) throw new Error('Complete 42-design pack required');
    for (const id of ids) {
        const asset = manifest.assets[id]; const proof = provenance.assets[id];
        if (proof.assetId !== id || proof.attemptId !== asset.attemptId || proof.sha256 !== asset.sha256 || !hex(proof.recipeHash) || !hex(proof.sourceSha256) || !hex(proof.promptSha256) || !Array.isArray(proof.referenceSha256) || !proof.referenceSha256.every(hex)) throw new Error('Portable provenance checksum mismatch');
        const importName = (asset.kind === 'gear' ? '' : 'sa_') + id.replaceAll('.', '_').replaceAll('-', '_');
        if (!stored.previewOnly && (typeof proof.selectionId !== 'string' || !proof.selectionId || proof.approved !== true || !object(proof.importProof) || proof.importProof.attemptId !== proof.attemptId || proof.importProof.sha256 !== proof.sha256 || proof.importProof.importedAndProven !== true || proof.importProof.importName !== importName || !hex(proof.importProof.evidenceSha256))) throw new Error('Exact selection/native proof binding required');
        const bytes = fs.readFileSync(localPath(directory, asset.exportFile));
        if (digest(bytes) !== asset.sha256) throw new Error('Pack image checksum mismatch');
    }
    const proofs = stored.previewOnly ? null : validateProofs(read('gear-import.json'), provenance.assets);
    const gearCompatibility = proofs?.compatibility || read('gear-compatibility.json');
    const catalog = { ...buildThemeCatalog({ manifest, gearCompatibility, previewOnly: true }), previewOnly: stored.previewOnly, rehearsalOnly: stored.previewOnly };
    if (jsonHash(catalog) !== jsonHash(stored) || provenance.packRevision !== catalog.packRevision || provenance.manifestSha256 !== jsonHash(manifest) || provenance.gearProofsSha256 !== (proofs ? jsonHash(proofs) : null)) throw new Error('Portable catalog/provenance revision mismatch');
    return { catalog, provenance, manifest, packRevision: catalog.packRevision };
}
module.exports = { loadThemePack, validateProofs, localPath, jsonHash };
