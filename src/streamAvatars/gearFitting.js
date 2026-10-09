const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { SET_NAME, HATS, digest, object } = require('./gearCompatibility');
const hasUtf8Bom = bytes => bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
const sourceText = bytes => (hasUtf8Bom(bytes) ? bytes.subarray(3) : bytes).toString('utf8');
function parseSource(sourceBytes) {
    let data; try { data = JSON.parse(sourceText(sourceBytes)); } catch { throw new Error('Invalid settings JSON'); }
    if (!object(data) || !object(data.avatarData)) throw new Error('Settings must contain native avatarData');
    return data;
}
const point = p => object(p) && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 4096 && Math.abs(p.y) <= 4096;
function buildFittingPlan({ sourceBytes, overrides = {} }) {
    const data = parseSource(sourceBytes); const avatars = [], skipped = [];
    for (const avatarKey of Object.keys(data.avatarData).sort()) {
        const a = data.avatarData[avatarKey]; let reason;
        if (['__proto__', 'constructor', 'prototype'].includes(avatarKey) || !/^[a-zA-Z0-9_-]{1,128}$/.test(avatarKey) || !object(a) || !Number.isInteger(a.width) || !Number.isInteger(a.height) || a.width < 1 || a.height < 1 || a.width > 4096 || a.height > 4096 || !Array.isArray(a.CanUseGear) || !a.CanUseGear.every(s => typeof s === 'string') || !object(a.animationData)) reason = 'malformed-geometry';
        const pivots = [];
        if (!reason) {
            if (a.CanUseGear.includes(SET_NAME)) reason = 'existing-namespace';
            for (const [animation, animationData] of Object.entries(a.animationData).sort(([x], [y]) => x.localeCompare(y))) {
                if (!/^[a-zA-Z0-9_-]{1,128}$/.test(animation) || !object(animationData) || !Array.isArray(animationData.frameData)) { reason = 'malformed-geometry'; break; }
                for (const [frame, f] of animationData.frameData.entries()) {
                    if (!object(f) || ['gearPivot', 'uniquePivot', 'uniqueData'].some(k => f[k] !== undefined && !object(f[k]))) { reason = 'malformed-geometry'; break; }
                    if (['gearPivot', 'uniquePivot', 'uniqueData'].some(k => f[k] && Object.hasOwn(f[k], SET_NAME))) reason = 'existing-namespace';
                    const avatarOverride = overrides[avatarKey] || {}; const animationOverride = avatarOverride.animations?.[animation] || {};
                    const p = { x: 0, y: a.height * 0.75, ...avatarOverride, ...animationOverride, ...animationOverride.frames?.[frame] };
                    if (!point(p)) throw new Error('Invalid provisional pivot override');
                    pivots.push({ animation, frame, x: p.x, y: p.y });
                }
            }
            if (!pivots.length) reason = reason || 'malformed-geometry';
        }
        if (reason) { skipped.push({ avatarKey, reason }); continue; }
        avatars.push({ avatarKey, width: a.width, height: a.height, frameCount: pivots.length, pivots });
    }
    const gearCompatibility = { schemaVersion: 1, setName: SET_NAME, provisional: true, graphicsVerified: false, avatars: {} };
    for (const a of avatars) {
        const fitRevision = digest(JSON.stringify({ setName: SET_NAME, ...a }));
        gearCompatibility.avatars[a.avatarKey] = Object.fromEntries(Object.entries(HATS).map(([theme, hats]) => [theme, { slot: 'head', primary: { setName: SET_NAME, pieceName: hats[0].pieceName }, alternate: { setName: SET_NAME, pieceName: hats[1].pieceName }, fitRevision }]));
    }
    return { schemaVersion: 1, setName: SET_NAME, sourceChecksum: digest(sourceBytes), provisional: true, graphicsVerified: false, avatars, skipped, gearCompatibility };
}
// Node24 preserves native numeric tokens (including Int64/decimal precision) when
// rewriting unrelated settings. Parsed numbers are used only for plan geometry.
const preserveNumbers = (key, value, context) => typeof value === 'number' ? JSON.rawJSON(context.source) : value;
const parseExact = bytes => JSON.parse(sourceText(bytes), preserveNumbers);
function stripOwn(data) {
    const copy = parseExact(Buffer.from(JSON.stringify(data)));
    for (const a of Object.values(copy.avatarData)) {
        if (!object(a)) continue;
        if (Array.isArray(a.CanUseGear)) a.CanUseGear = a.CanUseGear.filter(s => s !== SET_NAME);
        if (object(a.animationData)) for (const animation of Object.values(a.animationData)) if (Array.isArray(animation?.frameData)) for (const f of animation.frameData) {
            if (!object(f?.gearPivot)) continue;
            delete f.gearPivot[SET_NAME]; if (!Object.keys(f.gearPivot).length) delete f.gearPivot;
        }
    }
    return copy;
}
function privateWrite(filename, bytes) {
    const fd = fs.openSync(filename, 'wx', 0o600);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function applyFittingPlan({ settingsPath, plan, appClosed = false }) {
    if (appClosed !== true) throw new Error('Confirm Stream Avatars is closed with --app-closed');
    if (!fs.lstatSync(settingsPath).isFile()) throw new Error('Settings must be a regular file');
    const sourceBytes = fs.readFileSync(settingsPath);
    if (digest(sourceBytes) !== plan?.sourceChecksum) throw new Error('Settings checksum changed; create a new plan');
    parseSource(sourceBytes); const original = parseExact(sourceBytes); const eligible = buildFittingPlan({ sourceBytes });
    if (plan.schemaVersion !== 1 || plan.setName !== SET_NAME || plan.provisional !== true || plan.graphicsVerified !== false || !Array.isArray(plan.avatars)) throw new Error('Invalid fitting plan');
    const next = parseExact(sourceBytes); const seen = new Set();
    for (const a of plan.avatars) {
        const base = eligible.avatars.find(e => e.avatarKey === a.avatarKey);
        if (!base || seen.has(a.avatarKey) || a.width !== base.width || a.height !== base.height || a.frameCount !== base.frameCount || !Array.isArray(a.pivots) || a.pivots.length !== base.pivots.length) throw new Error('Invalid fitting avatar');
        seen.add(a.avatarKey); const target = next.avatarData[a.avatarKey]; target.CanUseGear.push(SET_NAME);
        for (let i = 0; i < base.pivots.length; i++) {
            const p = a.pivots[i], b = base.pivots[i];
            if (!point(p) || p.animation !== b.animation || p.frame !== b.frame) throw new Error('Invalid fitting frame pivot');
            const f = target.animationData[p.animation].frameData[p.frame]; f.gearPivot = { ...f.gearPivot, [SET_NAME]: { x: p.x, y: p.y } };
        }
    }
    if (!isDeepStrictEqual(stripOwn(original), stripOwn(next))) throw new Error('Fitting changed unrelated settings');
    const jsonBytes = Buffer.from(JSON.stringify(next, null, 2) + '\n');
    const bytes = hasUtf8Bom(sourceBytes) ? Buffer.concat([sourceBytes.subarray(0, 3), jsonBytes]) : jsonBytes;
    const directory = path.dirname(path.resolve(settingsPath)); const tag = randomUUID();
    const backupPath = path.join(directory, `.sa-fit-backup-${tag}.json`), temporaryPath = path.join(directory, `.sa-fit-${tag}.tmp`);
    // Refuse a changed source again immediately before backup and atomic replacement.
    if (!fs.readFileSync(settingsPath).equals(sourceBytes)) throw new Error('Settings checksum changed');
    privateWrite(backupPath, sourceBytes);
    if (!fs.readFileSync(backupPath).equals(sourceBytes)) throw new Error('Private backup verification failed');
    try {
        privateWrite(temporaryPath, bytes);
        if (!fs.readFileSync(settingsPath).equals(sourceBytes)) throw new Error('Settings checksum changed');
        if (!fs.readFileSync(temporaryPath).equals(bytes)) throw new Error('Fitting write verification failed');
        fs.renameSync(temporaryPath, settingsPath);
        if (!fs.readFileSync(settingsPath).equals(bytes)) throw new Error('Fitting write verification failed');
        if (process.platform !== 'win32') { const fd = fs.openSync(directory, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
    } finally { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); }
    return { backupPath, avatarCount: seen.size };
}
module.exports = { SET_NAME, buildFittingPlan, applyFittingPlan };
