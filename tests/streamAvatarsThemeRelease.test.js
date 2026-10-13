const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { PNG } = require('pngjs');
const { unzipSync, strFromU8 } = require('fflate');
const { ArtworkWorkflow } = require('../scripts/artwork/workflow');
const { buildPackage } = require('../src/streamAvatars/package');
let root, workflow, manifest;
beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sa-release-')));
    workflow = new ArtworkWorkflow({ workspace: path.join(root, 'work') });
    manifest = { assets: {} };
    for (const job of workflow.prepare()) {
        const { width, height, padding } = job.brief.frame;
        const png = new PNG({ width, height });
        const top = job.brief.kind === 'backdrop' ? height - 20 : padding;
        const bottom = job.brief.kind === 'backdrop' ? height : Math.min(height - padding, top + Math.min(20, job.brief.visibleHeightLimit));
        for (let y = top; y < bottom; y++) for (let x = padding; x < width - padding; x++) png.data.set([100, 140, 180, 255], (y * width + x) * 4);
        const file = path.join(root, 'input.png'); fs.writeFileSync(file, PNG.sync.write(png));
        const record = workflow.record({ job: job.jobId, file });
        manifest.assets[record.assetId] = { attemptId: record.attemptId, approved: true, nativeProven: true };
    }
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
function approveAll() {
    for (const [asset, choice] of Object.entries(manifest.assets)) {
        const record = workflow.attempt(choice.attemptId);
        workflow.select({ asset, attempt: record.attemptId, approve: true, proof: { importedAndProven: true, attemptId: record.attemptId, sha256: record.sha256, importName: 'sa_' + asset.replaceAll('.', '_').replaceAll('-', '_'), notes: 'Synthetic native fixture evidence' } });
    }
}
test('explicit candidate pack is portable, atomic and deterministic; approval flags cannot promote it', () => {
    const destination = path.join(root, 'candidate');
    const pack = workflow.candidatePack({ manifest, destination });
    expect(pack.catalog).toMatchObject({ previewOnly: true, rehearsalOnly: true });
    expect(pack.catalog.assets).toHaveLength(30);
    expect(pack.packRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(workflow.selections()).toEqual({});
    const serialized = fs.readFileSync(path.join(destination, 'provenance.json'), 'utf8');
    expect(serialized).not.toContain(root); expect(serialized).not.toContain('sourceFile');
    const one = buildPackage({ themePackDir: destination, previewOnly: true });
    const two = buildPackage({ themePackDir: destination, previewOnly: true });
    expect(one.imageCount).toBe(54); expect(one.archive).toEqual(two.archive);
    const files = unzipSync(one.archive);
    expect(Object.keys(files).filter(f => f.endsWith('.png'))).toHaveLength(54);
    expect(strFromU8(files['scripts/sa_helper_bridge/sa_helper_bridge.lua'])).toContain(pack.packRevision);
    expect(() => buildPackage({ themePackDir: destination })).toThrow(/rehearsal|preview/i);
    expect(() => workflow.promote({ destination: path.join(root, 'prod') })).toThrow(/selection|release|unapproved/i);
    expect(() => workflow.candidatePack({ manifest, destination })).toThrow(/exist|conflict/i);
});
test('strict promotion needs exact current image selections and native import proofs', () => {
    approveAll();
    const selection = Object.values(workflow.selections())[0]; const file = workflow.local('selections/' + selection.selectionId + '.json');
    const original = fs.readFileSync(file); selection.importProof.sha256 = '0'.repeat(64); fs.writeFileSync(file, JSON.stringify(selection));
    expect(() => workflow.promote({ destination: path.join(root, 'bad') })).toThrow(/proof/i);
    expect(fs.existsSync(path.join(root, 'bad'))).toBe(false);
    fs.writeFileSync(file, original);
    const pack = workflow.promote({ destination: path.join(root, 'prod') });
    expect(pack.catalog.previewOnly).toBe(false); expect(pack.catalog.rehearsalOnly).toBe(false);
    expect(buildPackage({ themePackDir: path.join(root, 'prod') }).imageCount).toBe(54);
    const image = path.join(root, 'prod', pack.catalog.assets[0].exportFile); fs.appendFileSync(image, 'tamper');
    expect(() => buildPackage({ themePackDir: path.join(root, 'prod') })).toThrow(/checksum/i);
});
test('stale image proofs, arbitrary import names, incomplete maps and symlink destinations reject', () => {
    approveAll();
    const selection = Object.values(workflow.selections())[0]; const file = workflow.local('selections/' + selection.selectionId + '.json');
    const original = fs.readFileSync(file); selection.importProof.importName = 'foreign-image'; fs.writeFileSync(file, JSON.stringify(selection));
    expect(() => workflow.promote({ destination: path.join(root, 'arbitrary') })).toThrow(/name|checksum/i);
    fs.writeFileSync(file, original);
    delete manifest.assets[Object.keys(manifest.assets)[0]];
    expect(() => workflow.candidatePack({ manifest, destination: path.join(root, 'missing') })).toThrow(/30|complete/i);
    fs.symlinkSync(workflow.workspace, path.join(root, 'link'));
    expect(() => workflow.promote({ destination: path.join(root, 'link/out') })).toThrow(/Symlink/i);
});
test('interrupted staged write never publishes or leaves a partial destination', () => {
    const destination = path.join(root, 'interrupted');
    const original = fs.writeFileSync;
    const spy = jest.spyOn(fs, 'writeFileSync').mockImplementation((file, ...args) => {
        if (String(file).includes('.stage-') && String(file).endsWith('catalog.json')) throw new Error('interrupted write');
        return original(file, ...args);
    });
    try { expect(() => workflow.candidatePack({ manifest, destination })).toThrow('interrupted write'); }
    finally { spy.mockRestore(); }
    expect(fs.existsSync(destination)).toBe(false);
    expect(fs.readdirSync(root).some(name => name.includes('.stage-'))).toBe(false);
});

test('candidate CLI packages the exact attempts and runner advertises the same revision', () => {
    const { spawnSync } = require('node:child_process');
    const input = path.join(root, 'choices.json'); fs.writeFileSync(input, JSON.stringify(manifest));
    const destination = path.join(root, 'cli-pack');
    const result = spawnSync(process.execPath, ['scripts/sa-artwork.js', 'candidate-pack', '--workspace', workflow.workspace, '--manifest-file', input, '--destination', destination], { encoding: 'utf8' });
    expect(result.status).toBe(0); expect(result.stderr).toBe('');
    const pack = JSON.parse(result.stdout); const output = path.join(root, 'review.zip');
    const zip = spawnSync(process.execPath, ['scripts/sa-package.js', '--candidate-pack', destination, '--output', output], { encoding: 'utf8' });
    expect(zip.status).toBe(0); expect(zip.stdout).toContain(pack.packRevision); expect(fs.existsSync(output)).toBe(true);
});

test('candidate map checks supplied hashes and late changed selections prevent publish', () => {
    const first = Object.keys(manifest.assets)[0]; manifest.assets[first].sha256 = '0'.repeat(64);
    expect(() => workflow.candidatePack({ manifest, destination: path.join(root, 'stale-candidate') })).toThrow(/checksum/i);
    delete manifest.assets[first].sha256; approveAll();
    const destination = path.join(root, 'changed-selection');
    const original = fs.writeFileSync; let changed = false;
    const spy = jest.spyOn(fs, 'writeFileSync').mockImplementation((file, ...args) => {
        if (!changed && String(file).includes('.stage-') && String(file).endsWith('catalog.json')) {
            changed = true;
            workflow.select({ asset: first, attempt: manifest.assets[first].attemptId, approve: true, proof: workflow.selections()[first].importProof });
        }
        return original(file, ...args);
    });
    try { expect(() => workflow.promote({ destination })).toThrow(/changed|selection|release/i); }
    finally { spy.mockRestore(); }
    expect(fs.existsSync(destination)).toBe(false);
});
test('candidate approval booleans cannot bypass production image proof bindings', () => {
    const destination = path.join(root, 'candidate'); workflow.candidatePack({ manifest, destination });
    const file = path.join(destination, 'catalog.json'); const catalog = JSON.parse(fs.readFileSync(file));
    catalog.previewOnly = false; catalog.rehearsalOnly = false; fs.writeFileSync(file, JSON.stringify(catalog));
    const provenanceFile = path.join(destination, 'provenance.json'); const provenance = JSON.parse(fs.readFileSync(provenanceFile));
    provenance.previewOnly = false; for (const asset of Object.values(provenance.assets)) asset.approved = true;
    fs.writeFileSync(provenanceFile, JSON.stringify(provenance));
    expect(() => buildPackage({ themePackDir: destination })).toThrow(/selection|proof/i);

});
function mutatedRelease(before, after) {
    const Module = require('node:module'); const filename = require.resolve('../src/streamAvatars/themeRelease');
    const source = fs.readFileSync(filename, 'utf8'); expect(source).toContain(before);
    const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = module.paths;
    compiled._compile(source.replace(before, after), filename); return compiled.exports;
}
test('candidate production gate mutation is detected by the real portable loader fixture', () => {
    const destination = path.join(root, 'mutation'); workflow.candidatePack({ manifest, destination });
    const invariant = api => expect(() => api.loadThemePack({ directory: destination })).toThrow(/rehearsal/);
    invariant(require('../src/streamAvatars/themeRelease'));
    expect(() => invariant(mutatedRelease('stored.previewOnly && !previewOnly', 'false'))).toThrow();
});
test('native image checksum mutation is detected by exact approved selection proof fixture', () => {
    approveAll(); const destination = path.join(root, 'proof-mutation'); workflow.promote({ destination });
    const file = path.join(destination, 'provenance.json'); const provenance = JSON.parse(fs.readFileSync(file));
    Object.values(provenance.assets)[0].importProof.sha256 = '0'.repeat(64); fs.writeFileSync(file, JSON.stringify(provenance));
    const invariant = api => expect(() => api.loadThemePack({ directory: destination })).toThrow(/proof/i);
    invariant(require('../src/streamAvatars/themeRelease'));
    expect(() => invariant(mutatedRelease('proof.importProof.sha256 !== proof.sha256', 'false'))).toThrow();
});
test('portable production loader rejects changed native import names', () => {
    approveAll(); const destination = path.join(root, 'production-names'); workflow.promote({ destination });
    const file = path.join(destination, 'provenance.json'); const provenance = JSON.parse(fs.readFileSync(file));
    Object.values(provenance.assets)[0].importProof.importName = 'foreign-network-name'; fs.writeFileSync(file, JSON.stringify(provenance));
    expect(() => buildPackage({ themePackDir: destination })).toThrow(/name|proof/i);
});


test('scenery-only candidate contains thirty designs and no catalog or native gear', () => {
    const scenery = { assets: Object.fromEntries(Object.entries(manifest.assets).filter(([id]) => !id.includes('.gear.'))) };
    const destination = path.join(root, 'scenery-only');
    const pack = workflow.candidatePack({ manifest: scenery, destination });
    expect(pack.catalog.assets).toHaveLength(30); expect(pack.catalog).not.toHaveProperty('gear');
    expect(fs.readdirSync(destination).sort()).toEqual(['assets','catalog.json','manifest.json','provenance.json']);
    const result = buildPackage({ themePackDir: destination, previewOnly: true });
    expect(result.imageCount).toBe(54);
    const files = unzipSync(result.archive);
    expect(Object.keys(files).filter(f => f.endsWith('.png'))).toHaveLength(54);
    expect(Object.keys(files).some(f => f.startsWith('gear/'))).toBe(false);
    const native = JSON.parse(strFromU8(files['data.txt'])); expect(native.gear).toEqual({}); expect(native.avatar).toEqual({});
});
test('scenery-only promotion needs image selection proofs without an avatar fitting proof', () => {
    approveAll();
    const pack = workflow.promote({ destination: path.join(root, 'scenery-production') });
    expect(pack.catalog.assets).toHaveLength(30); expect(pack.catalog.previewOnly).toBe(false);
    expect(pack.catalog).not.toHaveProperty('gear');
});
