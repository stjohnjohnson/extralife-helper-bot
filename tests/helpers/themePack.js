// Complete portable packs built from synthetic pixels, independent of ignored local artwork.
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const { ArtworkWorkflow } = require('../../scripts/artwork/workflow');
function createThemePack(root, { approved = false } = {}) {
    root = fs.realpathSync(root);
    let workflow, manifest;
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
    function approveAll() {
        for (const [asset, choice] of Object.entries(manifest.assets)) {
            const record = workflow.attempt(choice.attemptId);
            workflow.select({ asset, attempt: record.attemptId, approve: true, proof: { importedAndProven: true, attemptId: record.attemptId, sha256: record.sha256, importName: 'sa_' + asset.replaceAll('.', '_').replaceAll('-', '_'), notes: 'Synthetic native fixture evidence' } });
        }
    }
    const directory = path.join(root, approved ? 'approved' : 'candidate');
    const pack = approved ? (approveAll(), workflow.promote({ destination: directory })) : workflow.candidatePack({ manifest, destination: directory });
    return { directory, packRevision: pack.packRevision };
}
module.exports = { createThemePack };
