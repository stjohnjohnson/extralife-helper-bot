const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fit, inspect, decode, bounds } = require('./png');
const { gallery } = require('./gallery');
const defaultSpec = path.resolve(__dirname, '../../integrations/stream-avatars/artwork');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const identifier = value => {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/.test(value) || value.includes('..')) throw new Error('Invalid identifier/path');
    return value;
};
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const validImportProof = (proof, record) => proof?.importedAndProven === true && proof.attemptId === record.attemptId && proof.sha256 === record.sha256 && typeof proof.notes === 'string' && !!proof.notes.trim() && typeof proof.importName === 'string' && !!proof.importName.trim();
class ArtworkWorkflow {
    constructor({ workspace = path.resolve(__dirname, '../../reports/stream-avatars-artwork'), spec = defaultSpec } = {}) {
        this.workspace = path.resolve(workspace);
        this.spec = path.resolve(spec);
        this.style = readJson(path.join(this.spec, 'style.json'));
        this.inventory = readJson(path.join(this.spec, 'inventory.json'));
        // Refuse symlink components, including existing ancestors of the workspace.
        this.safePath(this.workspace, this.workspace);
        fs.mkdirSync(this.workspace, { recursive: true });
        for (const dir of ['jobs', 'records', 'candidates', 'selections', 'validation', 'gallery']) fs.mkdirSync(this.local(dir), { recursive: true });
    }
    safePath(base, file) {
        const relative = path.relative(base, file);
        if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path escape');
        let current = path.parse(file).root;
        for (const part of file.slice(current.length).split(path.sep)) {
            current = path.join(current, part);
            try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Symlink path escape'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        return file;
    }
    local(relative) {
        if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Invalid local path');
        return this.safePath(this.workspace, path.resolve(this.workspace, relative));
    }
    immutable(relative, value) {
        const file = this.local(relative);
        const temp = this.local(`${relative}.${crypto.randomUUID()}.tmp`);
        fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
        try { fs.linkSync(temp, file); } finally { fs.unlinkSync(temp); }
        return value;
    }
    briefs({ includeRetired = false } = {}) {
        const { themes, requiredKinds, assets } = this.inventory;
        if (!Array.isArray(themes) || !themes.length || new Set(themes).size !== themes.length || !requiredKinds || Object.values(requiredKinds).some(n => !Number.isInteger(n) || n < 1)) throw new Error('Malformed inventory contract');
        const expected = themes.length * Object.values(requiredKinds).reduce((sum, n) => sum + n, 0);
        if (!Array.isArray(assets) || assets.length !== expected) throw new Error(`Inventory must contain ${expected} assets (duplicate or missing IDs)`);
        if (assets.some(a => !themes.includes(a.theme) || !(a.kind in requiredKinds) || a.required !== true) || themes.some(theme => Object.entries(requiredKinds).some(([kind, count]) => assets.filter(a => a.theme === theme && a.kind === kind).length !== count))) throw new Error('Inventory theme/kind contract mismatch');
        const retiredAssets = this.inventory.retiredAssets || [];
        if (!Array.isArray(retiredAssets) || retiredAssets.some(a => !themes.includes(a.theme) || !(a.kind in requiredKinds))) throw new Error('Malformed retired inventory');
        const seen = new Set();
        const briefs = [...assets, ...retiredAssets].map(asset => {
            identifier(asset.id);
            if (seen.has(asset.id)) throw new Error('duplicate inventory ID');
            seen.add(asset.id);
            const recipe = readJson(this.safePath(this.spec, path.join(this.spec, 'recipes', `${asset.id}.json`)));
            if (recipe.assetId !== asset.id || recipe.styleRevision !== this.style.revision || typeof recipe.exactPrompt !== 'string') throw new Error('stale or malformed recipe');
            const references = (recipe.referenceIds || []).map(id => {
                const ref = this.style.references.find(r => r.id === id);
                if (!ref || !/^[a-f0-9]{64}$/.test(ref.sha256)) throw new Error('Invalid reference checksum');
                const file = this.safePath(this.spec, path.resolve(this.spec, ref.file));
                if (hash(fs.readFileSync(file)) !== ref.sha256) throw new Error('Changed reference checksum');
                return { id, file: ref.file, sha256: ref.sha256 };
            });
            const brief = { ...asset, styleRevision: this.style.revision, exactPrompt: recipe.exactPrompt, references, recipeHash: hash(JSON.stringify({ asset, recipe, style: this.style, references })) };
            // Retirement is review metadata, never part of a historical recipe hash.
            return retiredAssets.includes(asset) ? { ...brief, retired: true } : brief;
        });
        return includeRetired ? briefs : briefs.filter(b => !b.retired);
    }
    brief(id) {
        const brief = this.briefs({ includeRetired: true }).find(b => b.id === id);
        if (!brief) throw new Error(`Unknown asset ${id}`);
        return brief;
    }
    activeBrief(id) {
        const brief = this.brief(id);
        if (brief.retired) throw new Error('Retired asset is review-only');
        return brief;
    }
    files(dir) { return fs.readdirSync(this.local(dir)).filter(f => f.endsWith('.json')).sort(); }
    jobs() {
        return this.files('jobs').map(file => {
            const job = readJson(this.local(`jobs/${file}`));
            if (job.schemaVersion !== 1 || !job.brief || !job.exactPrompt || file !== `${identifier(job.jobId)}.json` || job.assetId !== job.brief.id) throw new Error('Malformed job record');
            return job;
        });
    }
    records() {
        return this.files('records').map(file => {
            const record = readJson(this.local(`records/${file}`));
            if (record.schemaVersion !== 1 || !['generated', 'failed', 'uncertain'].includes(record.status) || file !== `${identifier(record.attemptId)}.json` || !record.assetId || !record.jobId) throw new Error('Malformed candidate record');
            if (record.jobAttemptSequence !== undefined && (!Number.isInteger(record.jobAttemptSequence) || record.jobAttemptSequence < 1)) throw new Error('Malformed attempt sequence');
            identifier(record.assetId); identifier(record.jobId);
            if (record.status === 'generated' && (!record.exactPrompt || !/^[a-f0-9]{64}$/.test(record.sha256) || !record.sourceFile || !record.exportFile)) throw new Error('Malformed generated record');
            return record;
        });
    }
    attempt(id) {
        identifier(id);
        const record = this.records().find(r => r.attemptId === id);
        if (!record) throw new Error('Unknown candidate record');
        return record;
    }
    createJob(brief, extras = {}) {
        const jobId = `${brief.id}-${crypto.randomUUID()}`;
        return this.immutable(`jobs/${jobId}.json`, { schemaVersion: 1, jobId, assetId: brief.id, createdAt: new Date().toISOString(), status: 'planned', brief, styleRevision: brief.styleRevision, recipeHash: brief.recipeHash, exactPrompt: brief.exactPrompt, references: brief.references, ...extras });
    }
    prepare({ asset, theme } = {}) {
        if (asset) this.activeBrief(asset);
        if (theme && !this.inventory.assets.some(b => b.theme === theme)) throw new Error('Unknown theme');
        const records = this.records();
        const jobs = this.jobs();
        return this.briefs().filter(b => (!asset || b.id === asset) && (!theme || b.theme === theme)).filter(b => !jobs.some(j => {
            if (j.assetId !== b.id || j.recipeHash !== b.recipeHash) return false;
            const attempts = records.filter(r => r.jobId === j.jobId);
            if (attempts.some(r => r.status === 'generated')) return true;
            const latest = attempts.sort((a, b) => a.jobAttemptSequence && b.jobAttemptSequence ? a.jobAttemptSequence - b.jobAttemptSequence : a.createdAt.localeCompare(b.createdAt)).at(-1);
            return latest?.status !== 'failed';
        })).map(b => this.createJob(b));
    }
    record({ fromAttempt, job: jobId, file, status = 'generated', note = '', fit: shouldFit = false, metadata = {}, alphaThreshold = 1 }) {
        if (fromAttempt) {
            if (jobId || file || status !== 'generated') throw new Error('Export-only revision accepts --from-attempt instead of --job/--file/status');
            const parent = this.attempt(fromAttempt);
            const validation = this.validate(fromAttempt);
            if (!validation.valid) throw new Error(`Cannot reexport invalid/stale parent: ${validation.errors.join('; ')}`);
            const brief = this.brief(parent.assetId);
            const job = this.createJob(brief, { parentAttemptId: parent.attemptId, operation: 'reexport', exactPrompt: parent.plannedPrompt, sourceGenerationAttemptId: parent.sourceGenerationAttemptId || parent.attemptId });
            return this.record({ job: job.jobId, file: this.local(parent.sourceFile), fit: shouldFit, alphaThreshold, note: 'Export-only revision; no new image generation call', metadata: { ...parent.metadata, assetId: parent.assetId, styleRevision: parent.styleRevision, executedPrompt: parent.exactPrompt, actualReferences: (parent.actualReferences || []).map(ref => ({ file: this.local(ref.file), sha256: ref.sha256, role: ref.role })), exportOnly: true } });
        }
        identifier(jobId);
        const job = this.jobs().find(j => j.jobId === jobId);
        if (!job) throw new Error('Unknown job');
        if (job.recipeHash !== this.brief(job.assetId).recipeHash) throw new Error('stale job');
        const prior = this.records().filter(r => r.jobId === jobId);
        if (prior.some(r => r.status === 'generated')) throw new Error('Job already has successful output');
        if (!['generated', 'failed', 'uncertain'].includes(status)) throw new Error('Invalid attempt status');
        if (metadata.executedPrompt !== undefined && (metadata.assetId !== job.assetId || metadata.styleRevision !== job.styleRevision || typeof metadata.executedPrompt !== 'string' || !metadata.executedPrompt.trim() || !Array.isArray(metadata.actualReferences))) throw new Error('Executed provenance asset/style identity mismatch');
        const actualInputs = (metadata.actualReferences || []).map(ref => {
            if (!ref || !ref.file || !/^[a-f0-9]{64}$/.test(ref.sha256)) throw new Error('Invalid actual reference checksum');
            const bytes = fs.readFileSync(ref.file);
            if (hash(bytes) !== ref.sha256) throw new Error('Actual reference checksum mismatch');
            return { ...ref, bytes };
        });
        const attemptId = `${job.assetId}-${crypto.randomUUID()}`;
        const base = { schemaVersion: 1, attemptId, jobId, jobAttemptSequence: Math.max(prior.length, ...prior.map(r => r.jobAttemptSequence || 0)) + 1, assetId: job.assetId, parentAttemptId: job.parentAttemptId || null, styleRevision: job.styleRevision, recipeHash: job.recipeHash, plannedPrompt: job.exactPrompt, exactPrompt: metadata.executedPrompt || job.exactPrompt, references: job.references, status, note, createdAt: new Date().toISOString(), operation: job.operation || 'generation', sourceGenerationAttemptId: job.sourceGenerationAttemptId || attemptId, tool: job.operation === 'reexport' ? 'local nearest-neighbor export; original built-in image_gen' : 'built-in image_gen', metadata, reviewStatus: 'unreviewed' };
        if (status !== 'generated') return this.immutable(`records/${attemptId}.json`, base);
        if (!file || !fs.statSync(file).isFile()) throw new Error('Missing source file');
        const source = fs.readFileSync(file);
        const exported = shouldFit ? fit(source, job.brief, alphaThreshold) : { bytes: source, recipe: { method: 'exact-canvas', alphaPreserved: true } };
        let visibleBounds = null;
        try { visibleBounds = inspect(exported.bytes, job.brief).visibleBounds; } catch { /* Preserve malformed originals for a failed validation report. */ }
        const dir = `candidates/${attemptId}`;
        fs.mkdirSync(this.local(dir));
        const actualReferences = actualInputs.map((ref, index) => {
            const file = `${dir}/reference-${index}.png`;
            fs.writeFileSync(this.local(file), ref.bytes, { flag: 'wx' });
            return { file, sha256: ref.sha256, role: ref.role || 'style', originalSourceLocation: path.resolve(ref.file) };
        });
        const sourceFile = `${dir}/source.png`;
        const exportFile = `${dir}/sprite.png`;
        fs.writeFileSync(this.local(sourceFile), source, { flag: 'wx' });
        fs.writeFileSync(this.local(exportFile), exported.bytes, { flag: 'wx' });
        return this.immutable(`records/${attemptId}.json`, { ...base, visibleBounds, actualReferences, originalSourceLocation: path.resolve(file), sourceFile, sourceSha256: hash(source), exportFile, sha256: hash(exported.bytes), exportRecipe: exported.recipe, frame: { ...job.brief.frame, frameCount: 1, fps: 0 }, anchor: job.brief.anchor });
    }
    validate(id) {
        const record = this.attempt(id);
        const brief = this.brief(record.assetId);
        const errors = [];
        let pixels = {};
        const sourceWarnings = [];
        let sourceAlpha = null;
        if (record.status !== 'generated') errors.push('Attempt has no generated output');
        if (record.recipeHash !== brief.recipeHash || record.styleRevision !== brief.styleRevision) errors.push('stale recipe/style/reference inputs');
        if (record.frame?.frameCount !== 1 || record.frame?.fps !== 0 || record.frame?.width !== brief.frame.width || record.frame?.height !== brief.frame.height) errors.push('Invalid static frame metadata');
        for (const [field, checksum] of [['sourceFile', 'sourceSha256'], ['exportFile', 'sha256']]) {
            try {
                const bytes = fs.readFileSync(this.local(record[field]));
                if (hash(bytes) !== record[checksum]) errors.push(`${field} checksum mismatch`);
                if (field === 'exportFile') { pixels = inspect(bytes, brief); errors.push(...pixels.errors); }
                else {
                    const original = decode(bytes);
                    const stats = bounds(original);
                    sourceAlpha = { width: original.width, height: original.height, transparentPixels: stats.transparent, partialPixels: stats.partial, maxAlpha: stats.maxAlpha };
                    if (stats.partial) sourceWarnings.push(`Original source contains partial alpha (${stats.partial} pixels); inspect retained source haze`);
                }
            } catch (error) { errors.push(`${field} source/output read failed: ${error.message}`); }
        }
        if (JSON.stringify(record.anchor) !== JSON.stringify(brief.anchor)) errors.push('Invalid anchor metadata');
        if (record.visibleBounds && JSON.stringify(record.visibleBounds) !== JSON.stringify(pixels.visibleBounds)) errors.push('Recorded visible bounds differ from decoded pixels');
        if (record.metadata?.executedPrompt && (record.metadata.assetId !== record.assetId || record.metadata.styleRevision !== record.styleRevision)) errors.push('Executed provenance identity mismatch');
        const job = this.jobs().find(j => j.jobId === record.jobId);
        for (const ref of [...(record.actualReferences || []), ...(record.references || [])]) {
            try {
                const file = ref.scope === 'workspace' || (record.actualReferences || []).includes(ref) ? this.local(ref.file) : this.safePath(this.spec, path.resolve(this.spec, ref.file));
                if (hash(fs.readFileSync(file)) !== ref.sha256) errors.push('reference checksum mismatch');
            } catch (error) { errors.push(`reference checksum/read failed: ${error.message}`); }
        }
        if (!job || job.exactPrompt !== record.plannedPrompt || (record.metadata?.executedPrompt && record.exactPrompt !== record.metadata.executedPrompt) || (!record.metadata?.executedPrompt && record.exactPrompt !== record.plannedPrompt) || JSON.stringify(job.references) !== JSON.stringify(record.references)) errors.push('Prompt/reference provenance mismatch');
        if (record.exportRecipe?.discardedNonzeroPixels) sourceWarnings.push(`Opt-in crop excluded ${record.exportRecipe.discardedNonzeroPixels} nonzero-alpha source pixels; inspect original source`);
        const result = { attemptId: id, valid: errors.length === 0, errors, warnings: [...sourceWarnings, ...(pixels.warnings || [])], alpha: pixels.alpha || null, sourceAlpha, tileSeam: pixels.tileSeam || null, visibleBounds: pixels.visibleBounds || null, checkedAt: new Date().toISOString() };
        this.immutable(`validation/${id}-${crypto.randomUUID()}.json`, result);
        return result;
    }
    selections() {
        const result = {};
        for (const file of this.files('selections')) {
            const selection = readJson(this.local(`selections/${file}`));
            if (!selection.assetId || !selection.attemptId || !selection.approved || !selection.selectionId || !Number.isInteger(selection.sequence)) throw new Error('Malformed selection record');
            if (!result[selection.assetId] || result[selection.assetId].sequence < selection.sequence) result[selection.assetId] = selection;
        }
        return result;
    }
    select({ asset, attempt, approve, proof = null }) {
        if (approve !== true) throw new Error('Explicit visual approval required (--approve)');
        this.activeBrief(asset);
        const record = this.attempt(attempt);
        if (record.assetId !== asset) throw new Error('Cross-asset selection rejected');
        const validation = this.validate(attempt);
        if (!validation.valid) throw new Error(`Candidate cannot be selected: ${validation.errors.join('; ')}`);
        if (proof && !validImportProof(proof, record)) throw new Error('Invalid import proof');
        const selections = this.selections();
        const selectionId = crypto.randomUUID();
        const sequence = Math.max(0, ...Object.values(selections).map(s => s.sequence)) + 1;
        return this.immutable(`selections/${selectionId}.json`, { schemaVersion: 1, selectionId, sequence, assetId: asset, attemptId: attempt, approved: true, sha256: record.sha256, recipeHash: record.recipeHash, importProof: proof, selectedAt: new Date().toISOString() });
    }
    revise({ asset, attempt, feedback }) {
        const entries = (Array.isArray(feedback) ? feedback : feedback?.feedback || []).filter(f => f.assetId === asset && (!attempt || f.attemptId === attempt));
        if (entries.length > 1) throw new Error('Ambiguous feedback: multiple candidates for asset; specify --attempt or use one feedback entry');
        const entry = entries[0];
        if (!entry || typeof entry.feedback !== 'string' || !entry.feedback.trim()) throw new Error('Feedback must include assetId, attemptId and feedback');
        const parent = this.attempt(entry.attemptId);
        if (parent.assetId !== asset || parent.status !== 'generated') throw new Error('Feedback parent asset/status mismatch');
        const validation = this.validate(parent.attemptId);
        if (validation.errors.some(e => e.includes('stale'))) throw new Error('stale parent; prepare new style job');
        if (validation.errors.some(e => /sourceFile|reference|provenance/i.test(e))) throw new Error(`Parent source/reference integrity failed: ${validation.errors.join('; ')}`);
        const brief = this.brief(asset);
        return this.createJob(brief, { parentAttemptId: parent.attemptId, feedback: entry.feedback, exactPrompt: `${brief.exactPrompt}\nRevision feedback: ${entry.feedback}\nEdit the preserved parent source. Preserve transparency, subject, palette, canvas, pixel style and generous padding unless feedback explicitly revises these constraints.`, references: [...brief.references, { id: parent.attemptId, file: parent.sourceFile, sha256: parent.sourceSha256, scope: 'workspace', role: 'edit-target' }] });
    }
    releaseCheck() {
        const errors = [];
        const selections = this.selections();
        const briefs = this.briefs();
        for (const id of Object.keys(selections)) if (!briefs.some(b => b.id === id)) errors.push(id + ': retired or unknown selection cannot enter release');
        for (const brief of briefs) {
            if (brief.kind === 'gear' && (brief.gearSlot !== 'head' || /backpack|goggles/i.test(brief.id + ' ' + brief.subject))) errors.push(brief.id + ': active gear must be a head-mounted hat or helmet');
            const selection = selections[brief.id];
            if (!selection) { errors.push(`${brief.id}: missing selection (unapproved)`); continue; }
            const result = this.validate(selection.attemptId);
            errors.push(...result.errors.map(e => `${brief.id}: ${e}`));
            const record = this.attempt(selection.attemptId);
            if (selection.sha256 !== record.sha256 || selection.recipeHash !== brief.recipeHash) errors.push(`${brief.id}: stale selection/checksum`);
            if (!validImportProof(selection.importProof, record)) errors.push(`${brief.id}: missing or invalid checksum-bound native import proof`);
        }
        return { valid: !errors.length, requiredAssets: briefs.length, selectedAssets: briefs.filter(b => selections[b.id]).length, errors };
    }
    review({ theme } = {}) {
        if (theme && !this.inventory.assets.some(b => b.theme === theme)) throw new Error('Unknown theme');
        const selections = this.selections();
        const cards = this.records().filter(r => r.status === 'generated' && (!theme || this.brief(r.assetId).theme === theme)).map(record => ({ ...record, brief: this.brief(record.assetId), validation: this.validate(record.attemptId), sourceImage: `data:image/png;base64,${fs.readFileSync(this.local(record.sourceFile)).toString('base64')}`, image: `data:image/png;base64,${fs.readFileSync(this.local(record.exportFile)).toString('base64')}`, selection: selections[record.assetId] || null, selectedImage: selections[record.assetId] ? `data:image/png;base64,${fs.readFileSync(this.local(this.attempt(selections[record.assetId].attemptId).exportFile)).toString('base64')}` : null }));
        const scenes = ['ambient', 'framed-game', 'full-game'].filter(name => fs.existsSync(this.local(`reference-layouts/${name}.jpg`))).map(name => ({ name, image: `data:image/jpeg;base64,${fs.readFileSync(this.local(`reference-layouts/${name}.jpg`)).toString('base64')}` }));
        return gallery(cards, scenes);
    }
}
module.exports = { ArtworkWorkflow, hash };
