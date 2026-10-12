const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PNG } = require('pngjs');
const { unzipSync, strFromU8 } = require('fflate');
const { buildPackage } = require('../src/streamAvatars/package');
const { ArtworkWorkflow } = require('../scripts/artwork/workflow');
let root;
let workflow;
const asset = 'kitchen.scenery.prep-counter';
function fixture(width = 96, height = 64, border = 4, colorType = 6) {
    const png = new PNG({ width, height });
    for (let y = border; y < height - border; y++) {
        for (let x = border; x < width - border; x++) png.data.set([148, 107, 73, 255], (y * width + x) * 4);
    }
    const file = path.join(root, `fixture-${width}-${height}-${border}-${colorType}.png`);
    fs.writeFileSync(file, PNG.sync.write(png, { colorType }));
    return file;
}
function candidate(id = asset, options = {}) {
    const job = workflow.prepare({ asset: id })[0];
    return workflow.record({ job: job.jobId, file: fixture(), ...options });
}
beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sa-art-test-')));
    workflow = new ArtworkWorkflow({ workspace: path.join(root, 'work') });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
test('prepares exactly 30 unique required briefs and only missing jobs', () => {
    const jobs = workflow.prepare();
    expect(jobs).toHaveLength(30);
    expect(new Set(jobs.map(j => j.assetId)).size).toBe(30);
    expect(jobs.every(j => j.brief.required && j.exactPrompt.includes('transparent'))).toBe(true);
    expect(jobs.find(j => j.assetId === asset).brief.frame).toEqual({ width: 96, height: 64, padding: 4 });
    expect(jobs.some(j => j.brief.kind === 'gear')).toBe(false);
    expect(workflow.prepare()).toEqual([]);
});
test('immutable attempts preserve source, exact prompt and checksum without selection', () => {
    const record = candidate();
    expect(record.exactPrompt).toContain('prep counter');
    expect(fs.readFileSync(path.join(workflow.workspace, record.sourceFile))).toEqual(fs.readFileSync(fixture()));
    expect(workflow.validate(record.attemptId).valid).toBe(true);
    expect(workflow.selections()).toEqual({});
    expect(() => workflow.record({ job: record.jobId, file: fixture() })).toThrow(/already|successful/);
    expect(workflow.prepare({ asset })).toEqual([]);
});
test('failed attempts resume without regenerating successes or uncertain jobs', () => {
    candidate();
    const job = workflow.prepare({ asset: 'kitchen.scenery.pot-utensils' })[0];
    workflow.record({ job: job.jobId, status: 'uncertain', note: 'Tool timed out' });
    expect(workflow.prepare({ theme: 'kitchen' }).map(j => j.assetId)).not.toContain(asset);
    expect(workflow.prepare({ asset: 'kitchen.scenery.pot-utensils' })).toEqual([]);
    const failed = workflow.prepare({ asset: 'party.scenery.play-blocks' })[0];
    workflow.record({ job: failed.jobId, status: 'failed', note: 'Confirmed tool failure' });
    expect(workflow.prepare({ asset: 'party.scenery.play-blocks' })).toHaveLength(1);
});
test('revision preserves explicit selection and parent provenance', () => {
    const record = candidate();
    workflow.select({ asset, attempt: record.attemptId, approve: true });
    const feedback = [{ assetId: asset, attemptId: record.attemptId, feedback: 'simpler silhouette <script>alert(1)</script>' }];
    const job = workflow.revise({ asset, feedback });
    expect(job.parentAttemptId).toBe(record.attemptId);
    expect(job.exactPrompt).toContain('simpler silhouette');
    expect(workflow.selections()[asset].attemptId).toBe(record.attemptId);
    expect(() => workflow.revise({ asset, feedback: [{ ...feedback[0], attemptId: 'missing' }] })).toThrow();
});
test('select rejects cross-asset, absent approval and stale recipes', () => {
    const record = candidate();
    expect(() => workflow.select({ asset: 'kitchen.scenery.pot-utensils', attempt: record.attemptId, approve: true })).toThrow(/asset/);
    expect(() => workflow.select({ asset, attempt: record.attemptId })).toThrow(/approval/);
    workflow.style = { ...workflow.style, revision: 'changed' };
    expect(() => workflow.select({ asset, attempt: record.attemptId, approve: true })).toThrow(/stale/);
});
test.each([[64, 64, 4, 6, 'dimensions'], [96, 64, 0, 6, 'border'], [96, 64, 4, 2, 'alpha']])('decodes PNG and rejects wrong canvas or alpha/clipped art (%s,%s,%s,%s)', (width, height, border, type, error) => {
    const job = workflow.prepare({ asset })[0];
    const record = workflow.record({ job: job.jobId, file: fixture(width, height, border, type) });
    expect(workflow.validate(record.attemptId).errors.join(' ')).toContain(error);
});
test('fit preserves source and exports scenery with deterministic visible-height limit', () => {
    const job = workflow.prepare({ asset: 'kitchen.scenery.pot-utensils' })[0];
    const file = fixture(120, 120, 10);
    const record = workflow.record({ job: job.jobId, file, fit: true });
    const result = workflow.validate(record.attemptId);
    expect(result.valid).toBe(true);
    expect(result.visibleBounds.height).toBeLessThanOrEqual(56);
    expect(record.exportRecipe.method).toBe('nearest-neighbor-fit');
    expect(fs.readFileSync(path.join(workflow.workspace, record.sourceFile))).toEqual(fs.readFileSync(file));
});
test('checksums detect altered export and missing source', () => {
    const record = candidate();
    fs.appendFileSync(path.join(workflow.workspace, record.exportFile), 'corrupt');
    expect(workflow.validate(record.attemptId).errors.join(' ')).toContain('checksum');
    fs.unlinkSync(path.join(workflow.workspace, record.sourceFile));
    expect(workflow.validate(record.attemptId).errors.join(' ')).toContain('source');
});
test('release rejects incomplete, unapproved and unproven selections', () => {
    expect(workflow.releaseCheck().valid).toBe(false);
    const record = candidate();
    workflow.select({ asset, attempt: record.attemptId, approve: true });
    const result = workflow.releaseCheck();
    expect(result.errors.join(' ')).toContain('missing selection');
    expect(result.errors.join(' ')).toContain('import proof');
});
test('rejects traversal, symlink escapes, malformed records and duplicate inventory IDs', () => {
    expect(() => workflow.validate('../outside')).toThrow(/identifier|path/);
    workflow.prepare({ asset });
    fs.symlinkSync(root, path.join(workflow.workspace, 'escape'));
    expect(() => workflow.local('escape/secret')).toThrow(/symlink|escape/);
    fs.writeFileSync(path.join(workflow.workspace, 'records', 'bad.json'), '{}');
    expect(() => workflow.prepare()).toThrow(/record/);
    workflow.inventory.assets.push(workflow.inventory.assets[0]);
    expect(() => workflow.briefs()).toThrow(/duplicate/);
});
test('gallery safely embeds images, metadata, feedback and selected comparison', () => {
    const record = candidate();
    const revision = workflow.revise({ asset, feedback: [{ assetId: asset, attemptId: record.attemptId, feedback: '</script><img src=x onerror=alert(1)>' }] });
    workflow.record({ job: revision.jobId, file: fixture() });
    workflow.select({ asset, attempt: record.attemptId, approve: true });
    const html = workflow.review({ theme: 'kitchen' });
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('Selected version');
    expect(html).toContain('Export feedback');
    expect(html).not.toContain('</script><img src=x');
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(html, { runScripts: 'dangerously' });
    const textarea = dom.window.document.querySelector('textarea');
    textarea.value = 'make smaller';
    textarea.dispatchEvent(new dom.window.Event('input'));
    expect(dom.window.document.querySelectorAll('article')).toHaveLength(2);
});
test('ingests executed provenance separately from planned prompt and preserves actual reference files', () => {
    const job = workflow.prepare({ asset })[0];
    const reference = fixture(32, 32, 4);
    const checksum = require('node:crypto').createHash('sha256').update(fs.readFileSync(reference)).digest('hex');
    const record = workflow.record({ job: job.jobId, file: fixture(), metadata: { assetId: asset, styleRevision: 'pixel-v1', executedPrompt: 'Actual precise image-generation prompt', actualReferences: [{ file: reference, sha256: checksum, role: 'style' }] } });
    expect(record.exactPrompt).toBe('Actual precise image-generation prompt');
    expect(record.plannedPrompt).toContain('prep counter');
    expect(record.actualReferences[0].sha256).toBe(checksum);
    fs.unlinkSync(reference);
    expect(workflow.validate(record.attemptId).valid).toBe(true);
    fs.appendFileSync(path.join(workflow.workspace, record.actualReferences[0].file), 'modified');
    expect(workflow.validate(record.attemptId).errors.join(' ')).toContain('reference checksum');
});
test('rejects invalid executed provenance identity and incorrect reference checksums', () => {
    const job = workflow.prepare({ asset })[0];
    expect(() => workflow.record({ job: job.jobId, file: fixture(), metadata: { assetId: 'other', executedPrompt: 'prompt', styleRevision: 'pixel-v1', actualReferences: [] } })).toThrow(/identity|asset/);
    expect(() => workflow.record({ job: job.jobId, file: fixture(), metadata: { assetId: asset, executedPrompt: 'prompt', styleRevision: 'pixel-v1', actualReferences: [{ file: fixture(), sha256: '0'.repeat(64) }] } })).toThrow(/reference checksum/);
});
test('reports partial alpha haze for review without silently repairing pixel alpha', () => {
    const file = fixture();
    const png = PNG.sync.read(fs.readFileSync(file));
    png.data[(8 * 96 + 8) * 4 + 3] = 8;
    fs.writeFileSync(file, PNG.sync.write(png));
    const job = workflow.prepare({ asset })[0];
    const record = workflow.record({ job: job.jobId, file });
    const result = workflow.validate(record.attemptId);
    expect(result.warnings.join(' ')).toContain('partial alpha');
    expect(PNG.sync.read(fs.readFileSync(path.join(workflow.workspace, record.exportFile))).data[(8 * 96 + 8) * 4 + 3]).toBe(8);
});
test('uncertain attempt can be recovered into same job without automatic repeat generation', () => {
    const job = workflow.prepare({ asset })[0];
    const uncertain = workflow.record({ job: job.jobId, status: 'uncertain', note: 'timeout' });
    const recovered = workflow.record({ job: job.jobId, file: fixture() });
    expect(workflow.records().map(r => r.attemptId)).toEqual(expect.arrayContaining([uncertain.attemptId, recovered.attemptId]));
    expect(workflow.prepare({ asset })).toEqual([]);
});
test('a failed job recovered with successful output does not queue another generation', () => {
    const job = workflow.prepare({ asset })[0];
    workflow.record({ job: job.jobId, status: 'failed', note: 'Initially reported failed' });
    workflow.record({ job: job.jobId, file: fixture() });
    expect(workflow.prepare({ asset })).toEqual([]);
});
test('confirmed failure resolves earlier uncertain status and permits a replacement job', () => {
    const job = workflow.prepare({ asset })[0];
    const uncertain = workflow.record({ job: job.jobId, status: 'uncertain' });
    const failure = workflow.record({ job: job.jobId, status: 'failed', note: 'Confirmed failure after timeout' });
    expect(failure.jobAttemptSequence).toBeGreaterThan(uncertain.jobAttemptSequence);
    expect(workflow.prepare({ asset })).toHaveLength(1);
});
test('revision rejects ambiguous feedback and can target the requested candidate explicitly', () => {
    const first = candidate();
    const second = workflow.record({ fromAttempt: first.attemptId, fit: true });
    const feedback = [{ assetId: asset, attemptId: first.attemptId, feedback: 'rounder' }, { assetId: asset, attemptId: second.attemptId, feedback: 'flatter' }];
    expect(() => workflow.revise({ asset, feedback })).toThrow(/multiple|ambiguous/i);
    const revision = workflow.revise({ asset, attempt: second.attemptId, feedback });
    expect(revision.parentAttemptId).toBe(second.attemptId);
    expect(revision.feedback).toBe('flatter');
});
test('revision rejects missing or changed parent source while allowing correctable export dimensions', () => {
    const record = candidate(asset, { file: fixture(64, 64) });
    const feedback = [{ assetId: asset, attemptId: record.attemptId, feedback: 'fix canvas' }];
    expect(workflow.revise({ asset, feedback }).parentAttemptId).toBe(record.attemptId);
    fs.appendFileSync(path.join(workflow.workspace, record.sourceFile), 'changed');
    expect(() => workflow.revise({ asset, feedback })).toThrow(/integrity|checksum|source/i);
    fs.unlinkSync(path.join(workflow.workspace, record.sourceFile));
    expect(() => workflow.revise({ asset, feedback })).toThrow(/integrity|source/i);
});
test('release rechecks import-proof identity and requires meaningful text fields', () => {
    const record = candidate();
    const proof = { importedAndProven: true, attemptId: record.attemptId, sha256: record.sha256, importName: asset, notes: 'Verified in native app' };
    expect(() => workflow.select({ asset, attempt: record.attemptId, approve: true, proof: { ...proof, notes: [] } })).toThrow(/proof/);
    const selection = workflow.select({ asset, attempt: record.attemptId, approve: true, proof });
    const file = path.join(workflow.workspace, 'selections', `${selection.selectionId}.json`);
    fs.writeFileSync(file, JSON.stringify({ ...selection, importProof: { ...proof, sha256: '0'.repeat(64) } }));
    expect(workflow.releaseCheck().errors.filter(e => e.startsWith(asset)).join(' ')).toMatch(/proof/);
});
test('validation detects invalid frame metadata and missing reference source', () => {
    const record = candidate();
    const file = path.join(workflow.workspace, 'records', `${record.attemptId}.json`);
    fs.writeFileSync(file, JSON.stringify({ ...record, frame: { ...record.frame, frameCount: 2 } }));
    expect(workflow.validate(record.attemptId).errors.join(' ')).toContain('frame metadata');
});
test('gallery theme filtering and exported feedback identify exact candidates', () => {
    const record = candidate();
    candidate('party.scenery.play-blocks');
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(workflow.review(), { runScripts: 'dangerously' });
    const doc = dom.window.document;
    const theme = doc.getElementById('theme');
    theme.value = 'kitchen';
    theme.dispatchEvent(new dom.window.Event('change'));
    expect([...doc.querySelectorAll('article')].filter(el => !el.hidden).map(el => el.dataset.attempt)).toEqual([record.attemptId]);
    let exported;
    dom.window.URL.createObjectURL = blob => { exported = blob; return 'blob:feedback'; };
    dom.window.URL.revokeObjectURL = () => {};
    doc.querySelector('textarea').value = 'smaller';
    dom.window.HTMLAnchorElement.prototype.click = () => {};
    doc.getElementById('export').click();
    expect(exported.type).toBe('application/json');
});
test('validates approved reference checksums and fences candidates when reference bytes change', () => {
    const spec = path.join(root, 'spec');
    fs.cpSync(workflow.spec, spec, { recursive: true });
    fs.copyFileSync(fixture(32, 32, 4), path.join(spec, 'pilot.png'));
    const hash = require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(spec, 'pilot.png'))).digest('hex');
    const styleFile = path.join(spec, 'style.json');
    const style = JSON.parse(fs.readFileSync(styleFile));
    style.references = [{ id: 'pilot', file: 'pilot.png', sha256: hash }];
    fs.writeFileSync(styleFile, JSON.stringify(style));
    const recipeFile = path.join(spec, 'recipes', `${asset}.json`);
    const recipe = JSON.parse(fs.readFileSync(recipeFile));
    recipe.referenceIds = ['pilot'];
    fs.writeFileSync(recipeFile, JSON.stringify(recipe));
    workflow = new ArtworkWorkflow({ workspace: path.join(root, 'refs-work'), spec });
    const record = candidate();
    expect(record.references[0].sha256).toBe(hash);
    fs.appendFileSync(path.join(spec, 'pilot.png'), 'changed');
    expect(() => workflow.select({ asset, attempt: record.attemptId, approve: true })).toThrow(/reference checksum/);
});
test('complete selections remain unreleasable until each checksum-bound native import proof exists', () => {
    for (const brief of workflow.briefs()) {
        const job = workflow.prepare({ asset: brief.id })[0];
        const record = workflow.record({ job: job.jobId, file: brief.kind === 'backdrop' ? backdropFixture() : fixture(128, 128, 8), fit: true });
        expect(() => workflow.select({ asset: brief.id, attempt: record.attemptId, approve: true, proof: { importedAndProven: true, attemptId: record.attemptId, sha256: 'bad', notes: 'test', importName: 'piece' } })).toThrow(/proof/);
        workflow.select({ asset: brief.id, attempt: record.attemptId, approve: true, proof: { importedAndProven: true, attemptId: record.attemptId, sha256: record.sha256, notes: 'idle/run/jump/sit and both directions checked on native app', importName: brief.id } });
    }
    expect(workflow.releaseCheck()).toMatchObject({ valid: true, requiredAssets: 30, selectedAssets: 30, errors: [] });
});
test('opt-in dominant alpha crop fits visible art and preserves original source and retained alpha', () => {
    const png = new PNG({ width: 100, height: 100 });
    png.data.set([100, 100, 100, 1], 0);
    for (let y = 25; y < 75; y++) for (let x = 25; x < 75; x++) png.data.set([100, 100, 100, 255], (y * 100 + x) * 4);
    const file = path.join(root, 'haze.png');
    fs.writeFileSync(file, PNG.sync.write(png));
    const job = workflow.prepare({ asset })[0];
    expect(() => workflow.record({ job: job.jobId, file, fit: true })).toThrow(/border/);
    const record = workflow.record({ job: job.jobId, file, fit: true, alphaThreshold: 128 });
    expect(record.exportRecipe.cropAlphaThreshold).toBe(128);
    expect(record.exportRecipe.discardedNonzeroPixels).toBe(1);
    expect(record.exportRecipe.fittedHeight).toBe(56);
    expect(fs.readFileSync(path.join(workflow.workspace, record.sourceFile))).toEqual(fs.readFileSync(file));
    const result = workflow.validate(record.attemptId);
    expect(result.warnings.join(' ')).toContain('crop');
    expect(record.exportRecipe.crop.x).toBe(25);
});
test('unapproved generation failures cannot be selected and gallery validates theme IDs', () => {
    const job = workflow.prepare({ asset })[0];
    const failed = workflow.record({ job: job.jobId, status: 'failed' });
    expect(() => workflow.select({ asset, attempt: failed.attemptId, approve: true })).toThrow(/no generated output/);
    expect(() => workflow.review({ theme: '<script>invalid</script>' })).toThrow(/theme/);
});
test('PNG validation rejects multi-frame animation and malformed PNG bytes', () => {
    const file = fixture();
    const bytes = fs.readFileSync(file);
    // A valid ancillary acTL chunk before IEND. Decoder would otherwise ignore animation metadata.
    const crc = require('pngjs/lib/crc').crc32;
    const chunk = Buffer.alloc(20);
    chunk.writeUInt32BE(8, 0); chunk.write('acTL', 4); chunk.writeUInt32BE(2, 8);
    chunk.writeInt32BE(crc(chunk.subarray(4, 16)), 16);
    fs.writeFileSync(file, Buffer.concat([bytes.subarray(0, bytes.length - 12), chunk, bytes.subarray(bytes.length - 12)]));
    const job = workflow.prepare({ asset })[0];
    const record = workflow.record({ job: job.jobId, file });
    expect(workflow.validate(record.attemptId).errors.join(' ')).toContain('animation');
});

test('scene theme choice displays its latest scenery even after another theme and a revision', () => {
    candidate('block-world.scenery.block-planter');
    const first = candidate();
    const revision = workflow.revise({ asset, feedback: [{ assetId: asset, attemptId: first.attemptId, feedback: 'simplify counter' }] });
    const latest = workflow.record({ job: revision.jobId, file: fixture() });
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(workflow.review(), { runScripts: 'dangerously' });
    const doc = dom.window.document;
    const theme = doc.getElementById('theme');
    theme.value = 'kitchen'; theme.dispatchEvent(new dom.window.Event('change'));
    const visible = [...doc.querySelectorAll('.strip img')].filter(img => !img.hidden);
    expect(visible).toHaveLength(1);
    expect(visible[0].alt).toBe(asset);
    expect(visible[0].src).toBe('data:image/png;base64,' + fs.readFileSync(path.join(workflow.workspace, latest.exportFile)).toString('base64'));
});
test('candidate validation fences recorded visible bounds and anchor against decoded pixels/brief', () => {
    const record = candidate();
    const file = path.join(workflow.workspace, 'records', `${record.attemptId}.json`);
    fs.writeFileSync(file, JSON.stringify({ ...record, visibleBounds: { x: 100, y: 100, width: 1, height: 1 }, anchor: { x: 999, y: -1 } }));
    const errors = workflow.validate(record.attemptId).errors.join(' ');
    expect(errors).toContain('anchor');
    expect(errors).toContain('visible bounds');
});
test('CLI prepares immutable jobs, persists gallery output and exits nonzero for incomplete release', () => {
    const { spawnSync } = require('node:child_process');
    const cli = path.resolve(__dirname, '../scripts/sa-artwork.js');
    const result = spawnSync(process.execPath, [cli, 'prepare', '--asset', asset, '--workspace', workflow.workspace], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    const jobs = JSON.parse(result.stdout);
    expect(jobs).toHaveLength(1);
    workflow.record({ job: jobs[0].jobId, file: fixture() });
    const review = spawnSync(process.execPath, [cli, 'review', '--theme', 'kitchen', '--workspace', workflow.workspace], { encoding: 'utf8' });
    expect(review.status).toBe(0);
    expect(fs.readFileSync(JSON.parse(review.stdout).file, 'utf8')).toContain('data:image/png;base64,');
    const check = spawnSync(process.execPath, [cli, 'release', '--check', '--workspace', workflow.workspace], { encoding: 'utf8' });
    expect(check.status).toBe(1);
    expect(JSON.parse(check.stdout).valid).toBe(false);
});
test('export-only revision retains executed provenance, parent source and existing selection without generation', () => {
    const old = candidate();
    workflow.select({ asset, attempt: old.attemptId, approve: true });
    const revision = workflow.record({ fromAttempt: old.attemptId, fit: true, alphaThreshold: 128 });
    expect(revision.parentAttemptId).toBe(old.attemptId);
    expect(revision.metadata.exportOnly).toBe(true);
    expect(revision.exactPrompt).toBe(old.exactPrompt);
    expect(fs.readFileSync(path.join(workflow.workspace, revision.sourceFile))).toEqual(fs.readFileSync(path.join(workflow.workspace, old.sourceFile)));
    expect(workflow.selections()[asset].attemptId).toBe(old.attemptId);
    expect(workflow.validate(revision.attemptId).valid).toBe(true);
});

const backdropId = 'block-world.backdrop.minimal-strip';
function backdropFixture(width = 1200, height = 180) {
    const png = new PNG({ width, height });
    for (let y = 100; y < 150; y++) for (let x = 40; x < width - 40; x++) png.data.set([49, 55, 68, 254], (y * width + x) * 4);
    for (let y = 70; y < 100; y++) for (let x = 180; x < 280; x++) png.data.set([60, 77, 68, 254], (y * width + x) * 4);
    const file = path.join(root, 'backdrop.png');
    fs.writeFileSync(file, PNG.sync.write(png));
    return file;
}
test('six independent backdrop briefs extend inventory without changing existing asset hashes', () => {
    const expectedOld = 'b32a95549dca9dc337eb2a0543b2ad7790995b5fb73218c1bc3fb3a2632735fa';
    expect(workflow.briefs()).toHaveLength(30);
    expect(workflow.brief(asset).recipeHash).toBe(expectedOld);
    expect(workflow.briefs().filter(b => b.kind === 'backdrop')).toHaveLength(6);
    expect(workflow.brief(backdropId)).toMatchObject({ tileAxis: 'x', frame: { width: 480, height: 64, padding: 0 }, visibleHeightLimit: 40 });
});
test('backdrop full-width fitting preserves aspect ratio and checks a continuous base and repeat edges', () => {
    const job = workflow.prepare({ asset: backdropId })[0];
    const file = backdropFixture();
    const r = workflow.record({ job: job.jobId, file, fit: true, alphaThreshold: 128 });
    const v = workflow.validate(r.attemptId);
    expect(v.valid).toBe(true);
    expect(v.visibleBounds).toMatchObject({ x: 0, width: 480 });
    expect(r.exportRecipe).toMatchObject({ method: 'nearest-neighbor-tile-fit', fittedWidth: 480, x: 0, y: 64 - r.exportRecipe.fittedHeight });
    expect(v.tileSeam).toMatchObject({ differingRows: 0, continuousBase: true });
    expect(fs.readFileSync(path.join(workflow.workspace, r.sourceFile))).toEqual(fs.readFileSync(file));
});
test('backdrop fitting rejects tall artwork rather than squeezing it into a strip', () => {
    const job = workflow.prepare({ asset: backdropId })[0];
    expect(() => workflow.record({ job: job.jobId, file: fixture(200, 200, 10), fit: true })).toThrow(/height|wide|shallow/i);
});
test('full-width tile fitting cannot lose a column to floating point rounding', () => {
    const job = workflow.prepare({ asset: backdropId })[0];
    const record = workflow.record({ job: job.jobId, file: backdropFixture(1154), fit: true });
    expect(record.exportRecipe.fittedWidth).toBe(480);
    expect(workflow.validate(record.attemptId).valid).toBe(true);
});
test('backdrop validation rejects opaque top and broken base while surfacing visible tile seams', () => {
    const { inspect } = require('../scripts/artwork/png');
    const brief = workflow.brief(backdropId);
    const png = new PNG({ width: 480, height: 64 });
    for (let y = 56; y < 64; y++) for (let x = 0; x < 480; x++) png.data.set([49,55,68,255], (y*480+x)*4);
    expect(inspect(PNG.sync.write(png), brief).errors).toEqual([]);
    png.data.set([200,200,200,255], (56*480+479)*4);
    const seam = inspect(PNG.sync.write(png), brief);
    expect(seam.tileSeam.differingRows).toBe(1);
    expect(seam.warnings.join(' ')).toMatch(/tile|seam/);
    png.data[3] = 255;
    expect(inspect(PNG.sync.write(png), brief).errors.join(' ')).toMatch(/top/);
    png.data[(63*480+80)*4+3] = 0;
    expect(inspect(PNG.sync.write(png), brief).errors.join(' ')).toMatch(/base/);
});
test('scene repeats backdrop beneath stable varied props and avatar guides across theme changes', () => {
    candidate('block-world.scenery.block-planter');
    candidate('block-world.scenery.ore-cube', { fit: true });
    candidate('block-world.scenery.torch-post', { fit: true });
    candidate('block-world.scenery.grass-tuft', { fit: true });
    candidate(asset);
    const bg = workflow.prepare({ asset: backdropId })[0];
    workflow.record({ job: bg.jobId, file: backdropFixture(), fit: true });
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(workflow.review(), { runScripts: 'dangerously' });
    const doc = dom.window.document;
    const tiles = [...doc.querySelectorAll('.backdrop-tile')];
    expect(tiles).toHaveLength(4);
    expect(tiles.map(t => parseInt(t.style.left))).toEqual([0,480,960,1440]);
    expect(tiles.every(t => t.classList.contains('backdrop-layer'))).toBe(true);
    const positions = [...doc.querySelectorAll('.prop-layer[data-theme="block-world"]')].map(t => t.style.left);
    expect(positions).toHaveLength(4);
    expect(new Set(positions).size).toBe(4);
    expect(doc.querySelector('.backdrop-layer').compareDocumentPosition(doc.querySelector('.prop-layer')) & 4).toBe(4);
    expect(doc.querySelector('.prop-layer').compareDocumentPosition(doc.querySelector('.avatar')) & 4).toBe(4);
    const theme = doc.getElementById('theme');
    theme.value = 'kitchen'; theme.dispatchEvent(new dom.window.Event('change'));
    expect(tiles.every(t => t.hidden)).toBe(true);
    theme.value = 'block-world'; theme.dispatchEvent(new dom.window.Event('change'));
    expect(tiles.every(t => !t.hidden)).toBe(true);
    const next = new JSDOM(workflow.review(), { runScripts: 'dangerously' });
    expect([...next.window.document.querySelectorAll('.prop-layer[data-theme="block-world"]')].map(t => t.style.left)).toEqual(positions);
});
test('gallery band height and baseline controls clamp preview values without mutating sprite metadata', () => {
    const record = candidate();
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(workflow.review(), { runScripts: 'dangerously' });
    const doc = dom.window.document;
    const height = doc.getElementById('band-height');
    const bottom = doc.getElementById('baseline-bottom');
    expect(height.value).toBe('120');
    expect(bottom.value).toBe('4');
    expect(doc.querySelector('.strip').style.height).toBe('120px');
    expect(doc.querySelector('.strip img').style.bottom).toBe('0px');
    height.value = '96'; height.dispatchEvent(new dom.window.Event('change'));
    bottom.value = '12'; bottom.dispatchEvent(new dom.window.Event('change'));
    expect(doc.querySelector('.strip').style.height).toBe('96px');
    expect(doc.querySelector('.strip img').style.bottom).toBe('8px');
    expect(doc.querySelector('.avatar').style.bottom).toBe('12px');
    height.value = '9999'; height.dispatchEvent(new dom.window.Event('change'));
    bottom.value = '-100'; bottom.dispatchEvent(new dom.window.Event('change'));
    expect(height.value).toBe('360');
    expect(bottom.value).toBe('0');
    height.value = '64'; height.dispatchEvent(new dom.window.Event('change'));
    bottom.value = '500'; bottom.dispatchEvent(new dom.window.Event('change'));
    expect(bottom.value).toBe('48');
    expect(workflow.attempt(record.attemptId).frame).toEqual(record.frame);
});
test('compact overview groups latest unique assets before candidate details and filters with theme', () => {
    candidate('block-world.scenery.block-planter');
    const first = candidate();
    const last = workflow.record({ fromAttempt: first.attemptId, fit: true });
    const { JSDOM } = require('jsdom');
    const doc = new JSDOM(workflow.review(), { runScripts: 'dangerously' }).window.document;
    const tiles = doc.querySelectorAll('#overview .overview-tile');
    expect(tiles).toHaveLength(2);
    const kitchenTile = doc.querySelector('#overview [data-theme="kitchen"] .overview-tile');
    expect(kitchenTile.dataset.attempt).toBe(last.attemptId);
    expect(kitchenTile.textContent).toContain('reexport');
    expect(kitchenTile.querySelector('a').hash).toBe('#candidate-' + last.attemptId);
    expect(doc.getElementById('review-counts').textContent).toContain('2 assets');
    expect(doc.getElementById('review-counts').textContent).toContain('3 candidates');
    expect(doc.querySelector('#overview').compareDocumentPosition(doc.querySelector('main')) & 4).toBe(4);
    const theme = doc.getElementById('theme');
    theme.value = 'kitchen'; theme.dispatchEvent(new doc.defaultView.Event('change'));
    expect(doc.querySelector('#overview [data-theme="block-world"]').hidden).toBe(true);
    expect(doc.querySelector('#overview [data-theme="kitchen"]').hidden).toBe(false);
});
test('feedback persists by exact attempt and reloads when local storage is available', () => {
    const record = candidate();
    const { JSDOM } = require('jsdom');
    const html = workflow.review();
    const first = new JSDOM(html, { url: 'https://art-review.test/', runScripts: 'dangerously' });
    const textarea = first.window.document.querySelector('textarea');
    textarea.value = '<script>Make smaller</script>';
    textarea.dispatchEvent(new first.window.Event('input'));
    const key = 'sa-artwork-feedback:' + record.attemptId;
    expect(first.window.localStorage.getItem(key)).toBe(textarea.value);
    const second = new JSDOM(html, { url: 'https://art-review.test/', runScripts: 'dangerously', beforeParse(window) { window.localStorage.setItem(key, textarea.value); } });
    expect(second.window.document.querySelector('textarea').value).toBe(textarea.value);
    expect(second.window.document.querySelector('textarea').textContent).toBe('');
    // A file URL/opaque origin denies localStorage; editing and export remain usable.
    const denied = new JSDOM(html, { runScripts: 'dangerously' });
    const field = denied.window.document.querySelector('textarea');
    field.value = 'new feedback'; field.dispatchEvent(new denied.window.Event('input'));
    expect(field.value).toBe('new feedback');
});

// Catch package replacement during artwork ports: the three tools and native heart catalog must coexist.
test('artWorkflowRetainsFoundationScriptsAndCatalog', () => {
    const project = path.resolve(__dirname, '..');
    const packageJson = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(project, 'package-lock.json'), 'utf8'));
    expect(packageJson.scripts).toMatchObject({
        'sa:art': 'node scripts/sa-artwork.js',
        'sa:package': 'node scripts/sa-package.js',
        'sa:integration': 'node scripts/sa-integration.js'
    });
    expect(packageJson.dependencies).toMatchObject({ pngjs: '7.0.0', ws: '8.22.0', fflate: '0.8.3' });
    expect(packageJson.devDependencies).not.toHaveProperty('pngjs');
    expect(lock.packages[''].dependencies.pngjs).toBe('7.0.0');
    expect(lock.packages[''].devDependencies).not.toHaveProperty('pngjs');
    expect(lock.packages['node_modules/pngjs'].version).toBe('7.0.0');
    expect(lock.packages['node_modules/pngjs'].dev).not.toBe(true);
    expect(Object.keys(lock.packages).filter(key => /(?:^|\/)node_modules\/pngjs$/.test(key)))
        .toEqual(['node_modules/pngjs']);
    const integrationDir = path.join(project, 'integrations/stream-avatars');
    const entries = unzipSync(buildPackage({ integrationDir }).archive);
    const catalog = JSON.parse(strFromU8(entries['data.txt']));
    expect(catalog.commands.sa_helper_bridge.scriptImages.sa_heart).toMatchObject({
        imageName: 'sa_heart.png', width: 32, height: 32
    });
    expect(Buffer.from(entries['scripts/sa_helper_bridge/sa_heart.png']))
        .toEqual(fs.readFileSync(path.join(integrationDir, 'assets/heart.png')));
});

const retiredId = 'kitchen.scenery.previous-counter';
function historicalScenery(select = false) {
    const currentSpec = workflow.spec;
    const oldSpec = path.join(root, 'old-spec');
    fs.cpSync(currentSpec, oldSpec, { recursive: true });
    const inventory = JSON.parse(fs.readFileSync(path.join(oldSpec, 'inventory.json')));
    delete inventory.retiredAssets;
    const definition = inventory.assets.find(a => a.id === asset);
    definition.id = retiredId;
    const recipe = JSON.parse(fs.readFileSync(path.join(oldSpec, 'recipes', asset + '.json')));
    recipe.assetId = retiredId;
    recipe.exactPrompt = 'TEST FIXTURE ONLY: transparent retired scenery counter';
    const recipeBytes = JSON.stringify(recipe, null, 2) + '\n';
    fs.writeFileSync(path.join(oldSpec, 'inventory.json'), JSON.stringify(inventory));
    fs.writeFileSync(path.join(oldSpec, 'recipes', retiredId + '.json'), recipeBytes);
    workflow = new ArtworkWorkflow({ workspace: workflow.workspace, spec: oldSpec });
    const record = candidate(retiredId);
    if (select) workflow.select({ asset: retiredId, attempt: record.attemptId, approve: true });
    const pending = workflow.createJob(workflow.brief(retiredId));
    const archive = workflow.local('history/retired-spec');
    fs.mkdirSync(path.join(archive, 'recipes'), { recursive: true });
    fs.writeFileSync(path.join(archive, 'inventory.json'), JSON.stringify({ schemaVersion: 1, retiredAssets: [definition] }));
    fs.copyFileSync(path.join(oldSpec, 'style.json'), path.join(archive, 'style.json'));
    fs.writeFileSync(path.join(archive, 'recipes', retiredId + '.json'), recipeBytes);
    workflow = new ArtworkWorkflow({ workspace: workflow.workspace, spec: currentSpec });
    return { ...record, pendingJobId: pending.jobId, archive, recipeBytes };
}
test('shipped specification exposes only scenery and backdrop briefs', () => {
    expect(workflow.briefs({ includeRetired: true })).toHaveLength(30);
    expect(workflow.briefs().every(b => ['scenery', 'backdrop'].includes(b.kind))).toBe(true);
    expect(workflow.prepare()).toHaveLength(30);
});
test('local archived scenery preserves historical recipe hash and original bytes', () => {
    const record = historicalScenery();
    expect(workflow.brief(retiredId)).toMatchObject({ retired: true, recipeHash: record.recipeHash });
    expect(fs.readFileSync(path.join(record.archive, 'recipes', retiredId + '.json'), 'utf8')).toBe(record.recipeBytes);
    expect(workflow.validate(record.attemptId).valid).toBe(true);
    expect(fs.readFileSync(workflow.local(record.sourceFile))).toEqual(fs.readFileSync(fixture()));
    expect(workflow.briefs()).toHaveLength(30);
    expect(workflow.prepare().some(j => j.assetId === retiredId)).toBe(false);
    expect(() => workflow.prepare({ asset: retiredId })).toThrow(/retired/i);
});
test('historical candidates remain valid and labeled in review but cannot be selected', () => {
    const record = historicalScenery();
    expect(workflow.validate(record.attemptId).valid).toBe(true);
    expect(() => workflow.select({ asset: record.assetId, attempt: record.attemptId, approve: true })).toThrow(/retired/i);
    const { JSDOM } = require('jsdom');
    const doc = new JSDOM(workflow.review()).window.document;
    expect(doc.querySelector('article').textContent).toContain('Retired');
    expect(doc.querySelector('article').dataset.asset).toBe(record.assetId);
    expect(doc.querySelectorAll('#overview .overview-tile')).toHaveLength(0);
    expect(doc.querySelector('.strip').innerHTML).not.toContain(record.assetId);
});
test('historical selections cannot satisfy or count toward the active release gate', () => {
    const record = historicalScenery(true);
    expect(workflow.selections()[record.assetId].attemptId).toBe(record.attemptId);
    const result = workflow.releaseCheck();
    expect(result.requiredAssets).toBe(30);
    expect(result.selectedAssets).toBe(0);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.startsWith(record.assetId + ':'))).toBe(false);
    expect(result.errors.join(' ')).toContain('outdoor.scenery.camp-supplies: missing selection');
});
test('rejects duplicate IDs across active and retired history', () => {
    const record = historicalScenery();
    fs.writeFileSync(path.join(record.archive, 'inventory.json'), JSON.stringify({ retiredAssets: [workflow.inventory.assets[0]] }));
    expect(() => workflow.briefs({ includeRetired: true })).toThrow(/duplicate/i);
});
test('composition excludes retired scenery even when its historical export is valid', () => {
    const { sceneLayout } = require('../scripts/artwork/composition');
    const record = candidate();
    const card = { ...record, brief: { ...workflow.brief(asset), retired: true }, validation: workflow.validate(record.attemptId) };
    expect(sceneLayout([card])).toEqual({ scenery: [], backdrops: [] });
});
test('retired scenery history cannot create new revision, export or generation jobs', () => {
    const record = historicalScenery(); const jobs = workflow.jobs().length;
    expect(() => workflow.revise({ asset: record.assetId, feedback: [{ assetId: record.assetId, attemptId: record.attemptId, feedback: 'simplify old scenery' }] })).toThrow(/retired/i);
    expect(() => workflow.record({ fromAttempt: record.attemptId, fit: true })).toThrow(/retired/i);
    expect(() => workflow.record({ job: record.pendingJobId, file: fixture() })).toThrow(/retired/i);
    expect(workflow.jobs()).toHaveLength(jobs); expect(workflow.validate(record.attemptId).valid).toBe(true);
});
test('stream-scale mockup switches between light and dark test scenes', () => {
    candidate();
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(workflow.review(), { runScripts: 'dangerously' });
    const select = dom.window.document.getElementById('scene');
    expect(Array.from(select.options).some(o => o.value === 'light')).toBe(true);
    select.value = 'light';
    select.dispatchEvent(new dom.window.Event('change'));
    const scene = dom.window.document.querySelector('.scene');
    expect(scene.style.backgroundColor).toBe('rgb(238, 234, 223)');
    expect(scene.style.backgroundImage).toBe('');
    select.value = '';
    select.dispatchEvent(new dom.window.Event('change'));
    expect(scene.style.backgroundColor).toBe('rgb(17, 19, 26)');
});

// These are synthetic PNG/proof fixtures in a disposable temp workspace, never native evidence.
function completeActiveReleaseFixture(skipAsset = null) {
    for (const brief of workflow.briefs().filter(b => b.id !== skipAsset)) {
        const job = workflow.prepare({ asset: brief.id })[0];
        const record = workflow.record({ job: job.jobId, file: brief.kind === 'backdrop' ? backdropFixture() : fixture(128, 128, 8), fit: true });
        workflow.select({ asset: brief.id, attempt: record.attemptId, approve: true, proof: {
            importedAndProven: true, attemptId: record.attemptId, sha256: record.sha256,
            notes: 'TEST FIXTURE ONLY: synthetic native proof; no real artwork approval or app fitting',
            importName: 'test-fixture-' + brief.id
        } });
    }
}
test('complete active release ignores retained retired approvals without changing their history', () => {
    const retired = historicalScenery(true);
    const history = workflow.selections()[retired.assetId];
    const historyFile = workflow.local('selections/' + history.selectionId + '.json');
    const historyBytes = fs.readFileSync(historyFile);
    completeActiveReleaseFixture();
    expect(workflow.releaseCheck()).toEqual({ valid: true, requiredAssets: 30, selectedAssets: 30, errors: [] });
    expect(workflow.selections()[retired.assetId]).toEqual(history);
    expect(fs.readFileSync(historyFile)).toEqual(historyBytes);
    expect(workflow.validate(retired.attemptId).valid).toBe(true);
    expect(() => workflow.select({ asset: retired.assetId, attempt: retired.attemptId, approve: true })).toThrow(/retired/i);
});
test('complete active release still rejects unknown selection IDs alongside retired history', () => {
    const retired = historicalScenery(true);
    completeActiveReleaseFixture();
    const old = workflow.selections()[retired.assetId];
    workflow.immutable('selections/unknown-fixture.json', { ...old, selectionId: 'unknown-fixture', assetId: 'unknown.scenery.stranger', sequence: 999 });
    expect(workflow.releaseCheck()).toEqual({ valid: false, requiredAssets: 30, selectedAssets: 30, errors: ['unknown.scenery.stranger: unknown selection cannot enter release'] });
});
test('retired approval cannot fill a missing active replacement in an otherwise complete release', () => {
    const retired = historicalScenery(true);
    const replacement = 'outdoor.scenery.camp-supplies';
    completeActiveReleaseFixture(replacement);
    expect(workflow.releaseCheck()).toEqual({ valid: false, requiredAssets: 30, selectedAssets: 29, errors: [replacement + ': missing selection (unapproved)'] });
    expect(workflow.selections()[retired.assetId].attemptId).toBe(retired.attemptId);
});
