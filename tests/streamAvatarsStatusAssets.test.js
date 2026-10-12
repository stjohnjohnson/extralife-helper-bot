const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PNG } = require('pngjs');
const { unzipSync } = require('fflate');
const { buildPackage } = require('../src/streamAvatars/package');

test('status export preserves the supplied animation geometry, timing, alpha and original RGB pixels', () => {
    const files = unzipSync(buildPackage().archive);
    const prefix = 'scripts/sa_helper_bridge/';
    expect(files[prefix + 'sa_bridge_healthy.png']).toBeDefined();
    const data = JSON.parse(Buffer.from(files['data.txt']).toString());
    expect(data.commands.sa_helper_bridge.scriptImages.sa_bridge_healthy).toMatchObject({
        width: 64, height: 64, scale: 1, details: { fps: 5, fpsPerFrame: Array(8).fill(5), loopTotal: 61 }
    });
    expect(data.commands.sa_helper_bridge.scriptImages.sa_bridge_unknown).toMatchObject({
        width: 64, height: 64, details: { fps: 1, fpsPerFrame: [1], loopTotal: 61 }
    });
    const source = path.resolve(__dirname, '../integrations/stream-avatars/source');
    const provenance = JSON.parse(fs.readFileSync(path.join(source, 'extra-life-idle.json')));
    expect(createHash('sha256').update(fs.readFileSync(path.join(source, 'extra-life-idle.gif'))).digest('hex')).toBe(provenance.sha256);
    const sheet = PNG.sync.read(Buffer.from(files[prefix + 'sa_bridge_healthy.png']));
    expect([sheet.width, sheet.height]).toEqual([512, 64]);
    for (let frame = 0; frame < 8; frame++) {
        const rgb = [];
        for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
            const at = (y * sheet.width + frame * 64 + x) * 4;
            const color = [...sheet.data.subarray(at, at + 3)];
            rgb.push(...color);
            expect(sheet.data[at + 3]).toBe(color.every(value => value === 0) ? 0 : 255);
        }
        expect(createHash('sha256').update(Buffer.from(rgb)).digest('hex')).toBe(provenance.frames[frame].rgbSha256);
        expect(provenance.frames[frame].durationMs).toBe(200);
    }
    expect(Object.keys(files).some(name => name.endsWith('.gif') || name.endsWith('extra-life-idle.json'))).toBe(false);
});
