const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { buildFittingPlan, applyFittingPlan, SET_NAME } = require('../src/streamAvatars/gearFitting');
const fixture = () => ({ credentials: 'never-print-me', userrecords: { viewer: { avatar: 'small', gear: 'saved', palette: 'blue' } }, avatarData: {
    small: { width: 48, height: 48, pixelsPerUnit: 0.6666667, CanUseGear: ['foreign'], animationData: { idle: { frameData: [{ gearPivot: { foreign: { x: 3, y: 4 } } }, {}] }, walk: { frameData: [{}] } } },
    large: { width: 96, height: 64, CanUseGear: [], animationData: { idle: { frameData: [{}] } } },
    malformed: { width: 0, height: 48 }, occupied: { width: 48, height: 48, CanUseGear: ['sa_helper_theme_hats'], animationData: { idle: { frameData: [{}] } } }
} });
const bytes = data => Buffer.from(JSON.stringify(data));
test('dry run lists provisional frame pivots without private settings or mutation', () => {
    const data = fixture(); const before = bytes(data);
    const plan = buildFittingPlan({ sourceBytes: before });
    expect(bytes(data)).toEqual(before); expect(plan.provisional).toBe(true); expect(plan.graphicsVerified).toBe(false);
    expect(plan.sourceChecksum).toMatch(/^[a-f0-9]{64}$/); expect(plan.avatars).toHaveLength(2);
    expect(plan.avatars[0]).toMatchObject({ avatarKey: 'large', width: 96, height: 64, frameCount: 1, pivots: [{ animation: 'idle', frame: 0, x: 0, y: 48 }] });
    expect(plan.skipped).toEqual([{ avatarKey: 'malformed', reason: 'malformed-geometry' }, { avatarKey: 'occupied', reason: 'existing-namespace' }]);
    expect(JSON.stringify(plan)).not.toMatch(/never-print-me|viewer|palette|foreign/);
});
test('explicit avatar, animation and frame fitting overrides compose without artwork', () => {
    const plan = buildFittingPlan({ sourceBytes: bytes(fixture()), overrides: { small: { x: 1, y: 30, animations: { idle: { x: 2, y: 31, frames: { 1: { x: 4, y: 32 } } } } } } });
    expect(plan.avatars.find(a => a.avatarKey === 'small').pivots).toEqual([{ animation: 'idle', frame: 0, x: 2, y: 31 }, { animation: 'idle', frame: 1, x: 4, y: 32 }, { animation: 'walk', frame: 0, x: 1, y: 30 }]);
    expect(() => buildFittingPlan({ sourceBytes: bytes(fixture()), overrides: { small: { x: Infinity } } })).toThrow(/pivot/);
});
test('malformed frame metadata and any existing own-set pivot skip the entire avatar', () => {
    const data = fixture(); data.avatarData.small.animationData.walk.frameData = [null]; data.avatarData.large.animationData.idle.frameData[0].uniquePivot = { sa_helper_theme_hats: {} };
    expect(buildFittingPlan({ sourceBytes: bytes(data) }).avatars).toEqual([]);
    expect(() => buildFittingPlan({ sourceBytes: bytes({ avatar: {} }) })).toThrow(/avatarData/);
});
function temporary(fn) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-fit-')); try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); } }
test('reviewed apply requires closed confirmation and current checksum, backs up exact bytes, changes only own permissions and pivots', () => temporary(dir => {
    const filename = path.join(dir, 'settings.json'); const original = bytes(fixture()); fs.writeFileSync(filename, original);
    const plan = buildFittingPlan({ sourceBytes: original });
    expect(() => applyFittingPlan({ settingsPath: filename, plan })).toThrow(/closed/); expect(fs.readFileSync(filename)).toEqual(original);
    const result = applyFittingPlan({ settingsPath: filename, plan, appClosed: true });
    expect(fs.readFileSync(result.backupPath)).toEqual(original); expect(fs.statSync(result.backupPath).mode & 0o777).toBe(0o600);
    const next = JSON.parse(fs.readFileSync(filename)); const expected = fixture();
    for (const avatar of plan.avatars) { const a = expected.avatarData[avatar.avatarKey]; a.CanUseGear.push(SET_NAME); for (const p of avatar.pivots) { const f = a.animationData[p.animation].frameData[p.frame]; f.gearPivot = { ...f.gearPivot, [SET_NAME]: { x: p.x, y: p.y } }; } }
    expect(next).toEqual(expected); expect(() => applyFittingPlan({ settingsPath: filename, plan, appClosed: true })).toThrow(/checksum/);
}));
test.each(['avatar', 'frame', 'namespace', 'coordinate'])('tampered reviewed plan rejects %s without writes', kind => temporary(dir => {
    const filename = path.join(dir, 'settings.json'); const original = bytes(fixture()); fs.writeFileSync(filename, original); const plan = buildFittingPlan({ sourceBytes: original });
    if (kind === 'avatar') plan.avatars[0].avatarKey = 'missing';
    if (kind === 'frame') plan.avatars[0].pivots[0].frame = 99;
    if (kind === 'namespace') plan.setName = 'foreign';
    if (kind === 'coordinate') plan.avatars[0].pivots[0].x = 'bad';
    expect(() => applyFittingPlan({ settingsPath: filename, plan, appClosed: true })).toThrow(); expect(fs.readFileSync(filename)).toEqual(original); expect(fs.readdirSync(dir)).toEqual(['settings.json']);
}));
test('CLI dry run writes sanitized private plan and never settings; explicit apply uses same safeguards', () => temporary(dir => {
    const filename = path.join(dir, 'settings.json'); const planPath = path.join(dir, 'plan.json'); const original = bytes(fixture()); fs.writeFileSync(filename, original);
    const run = args => spawnSync(process.execPath, [path.resolve('scripts/sa-fit.js'), ...args], { encoding: 'utf8' });
    let result = run(['--settings', filename, '--plan', planPath]); expect(result.status).toBe(0); expect(result.stdout + result.stderr).not.toContain('never-print-me'); expect(fs.readFileSync(filename)).toEqual(original);
    expect(JSON.parse(fs.readFileSync(planPath)).graphicsVerified).toBe(false);
    result = run(['--settings', filename, '--plan', planPath, '--apply']); expect(result.status).toBe(1); expect(fs.readFileSync(filename)).toEqual(original);
    result = run(['--settings', filename, '--plan', planPath, '--apply', '--app-closed']); expect(result.status).toBe(0); expect(JSON.parse(fs.readFileSync(filename)).avatarData.small.CanUseGear).toContain(SET_NAME);
}));
test('helper emits six-theme provisional candidate support for every eligible avatar and binds pivot revisions', () => {
    const first = buildFittingPlan({ sourceBytes: bytes(fixture()) }); const second = buildFittingPlan({ sourceBytes: bytes(fixture()), overrides: { small: { y: 25 } } });
    expect(first.gearCompatibility).toMatchObject({ provisional: true, graphicsVerified: false, setName: SET_NAME });
    expect(Object.keys(first.gearCompatibility.avatars)).toEqual(['large', 'small']);
    expect(Object.keys(first.gearCompatibility.avatars.small)).toHaveLength(6);
    expect(first.gearCompatibility.avatars.small.kitchen).toMatchObject({ slot: 'head', primary: { setName: SET_NAME, pieceName: 'kitchen_gear_chef_hat' }, alternate: { setName: SET_NAME, pieceName: 'kitchen_gear_cooks_cap' } });
    expect(first.gearCompatibility.avatars.small.kitchen.fitRevision).not.toBe(second.gearCompatibility.avatars.small.kitchen.fitRevision);
});
test('apply refuses symlink settings and malformed native JSON without any backup or mutation', () => temporary(dir => {
    const target = path.join(dir, 'settings.json'); const link = path.join(dir, 'link.json'); const original = bytes(fixture()); fs.writeFileSync(target, original); fs.symlinkSync(target, link);
    const plan = buildFittingPlan({ sourceBytes: original }); expect(() => applyFittingPlan({ settingsPath: link, plan, appClosed: true })).toThrow(/regular/);
    expect(fs.readFileSync(target)).toEqual(original); expect(fs.readdirSync(dir).sort()).toEqual(['link.json', 'settings.json']);
    expect(() => buildFittingPlan({ sourceBytes: Buffer.from('{SECRET') })).toThrow('Invalid settings JSON');
}));
test('prototype property avatar keys are skipped without corrupting generated candidate support', () => {
    const sourceBytes = Buffer.from(JSON.stringify(fixture()).replace('"small":', '"__proto__":'));
    const plan = buildFittingPlan({ sourceBytes });
    expect(plan.avatars.map(a => a.avatarKey)).toEqual(['large']);
    expect(plan.skipped).toContainEqual({ avatarKey: '__proto__', reason: 'malformed-geometry' });
});
test('apply verifies backup bytes before replacing the settings file', () => temporary(dir => {
    const filename = path.join(dir, 'settings.json'); const original = bytes(fixture()); fs.writeFileSync(filename, original); const plan = buildFittingPlan({ sourceBytes: original });
    const open = fs.openSync, write = fs.writeFileSync; let backupFd, corrupted = false;
    const openSpy = jest.spyOn(fs, 'openSync').mockImplementation((file, ...args) => { const fd = open(file, ...args); if (typeof file === 'string' && file.includes('.sa-fit-backup-')) backupFd = fd; return fd; });
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation((file, data, ...args) => { const corrupt = file === backupFd && !corrupted; if (corrupt) corrupted = true; return write(file, corrupt ? Buffer.concat([data, Buffer.from('corruption')]) : data, ...args); });
    try { expect(() => applyFittingPlan({ settingsPath: filename, plan, appClosed: true })).toThrow(/backup/); }
    finally { openSpy.mockRestore(); writeSpy.mockRestore(); }
    expect(fs.readFileSync(filename)).toEqual(original);
}));
test('apply preserves unrelated native numeric literals beyond JavaScript precision', () => temporary(dir => {
    const filename = path.join(dir, 'settings.json'); const original = Buffer.from(JSON.stringify(fixture()).replace('"credentials":', '"largeNativeCounter":9007199254740993,"nativeDecimal":0.123456789012345678901,"credentials":')); fs.writeFileSync(filename, original);
    const plan = buildFittingPlan({ sourceBytes: original }); applyFittingPlan({ settingsPath: filename, plan, appClosed: true });
    const next = fs.readFileSync(filename, 'utf8'); expect(next).toMatch(/"largeNativeCounter": 9007199254740993/); expect(next).toMatch(/"nativeDecimal": 0\.123456789012345678901/);
}));
test('native UTF8 BOM is accepted only at the beginning and remains part of source checksum', () => {
    const original = bytes(fixture()); const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const plan = buildFittingPlan({ sourceBytes: Buffer.concat([bom, original]) });
    const plain = buildFittingPlan({ sourceBytes: original });
    expect(plan.avatars).toEqual(plain.avatars); expect(plan.gearCompatibility).toEqual(plain.gearCompatibility);
    expect(plan.sourceChecksum).not.toBe(plain.sourceChecksum);
    expect(() => buildFittingPlan({ sourceBytes: Buffer.concat([bom, bom, original]) })).toThrow('Invalid settings JSON');
});
test('explicit BOM apply preserves BOM, exact backup and unrelated numeric tokens', () => temporary(dir => {
    const filename = path.join(dir, 'settings.json');
    const original = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(fixture()).replace('"credentials":', '"counter":9007199254740993,"decimal":0.123456789012345678901,"credentials":'))]);
    fs.writeFileSync(filename, original); const plan = buildFittingPlan({ sourceBytes: original });
    const applied = applyFittingPlan({ settingsPath: filename, plan, appClosed: true });
    expect(fs.readFileSync(applied.backupPath)).toEqual(original);
    const next = fs.readFileSync(filename); expect(next.subarray(0, 3)).toEqual(original.subarray(0, 3));
    expect(next.toString('utf8')).toContain('9007199254740993'); expect(next.toString('utf8')).toContain('0.123456789012345678901');
    expect(JSON.parse(next.subarray(3).toString('utf8')).avatarData.small.CanUseGear).toContain(SET_NAME);
}));
