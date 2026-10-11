const fs = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { PNG } = require('pngjs');
const { generateAssets } = require('../scripts/sa-assets');
test('celebration PNGs and manifests are transparent, correctly tiled and deterministic', () => {
    const dir = fs.mkdtempSync(join(tmpdir(), 'sa-assets-'));
    try {
        generateAssets(dir); const files = fs.readdirSync(dir).sort();
        expect(files.filter(name => name.endsWith('.json'))).toHaveLength(18);
        const first = files.map(name => fs.readFileSync(join(dir, name)));
        generateAssets(dir); expect(files.map(name => fs.readFileSync(join(dir, name)))).toEqual(first);
        for (const name of files.filter(name => name.endsWith('.json'))) {
            const manifest = JSON.parse(fs.readFileSync(join(dir, name))); const png = PNG.sync.read(fs.readFileSync(join(dir, manifest.file)));
            expect(png.width).toBe(manifest.frameWidth * manifest.frames / manifest.rows); expect(png.height).toBe(manifest.frameHeight * manifest.rows);
            const alpha = Array.from(png.data).filter((_, index) => index % 4 === 3);
            expect(alpha).toContain(0); expect(alpha.some(value => value > 0)).toBe(true);
            expect(manifest).toMatchObject({ transparent: true, loop: true });
        }
        for (const name of files) expect(fs.readFileSync(join(dir, name))).toEqual(fs.readFileSync(join('integrations/stream-avatars/assets', name)));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('gold confetti keeps a visible paper face throughout its tumble',()=>{
    const png=PNG.sync.read(fs.readFileSync('integrations/stream-avatars/assets/sa_confetti.png'));
    const manifest=JSON.parse(fs.readFileSync('integrations/stream-avatars/assets/sa_confetti.json'));
    for(let frame=0;frame<manifest.frames;frame++){
        const columns=new Set();
        for(let y=0;y<manifest.frameHeight;y++)for(let x=0;x<manifest.frameWidth;x++)if(png.data[(y*png.width+frame*manifest.frameWidth+x)*4+3]>0)columns.add(x);
        expect(columns.size).toBeGreaterThanOrEqual(3);
    }
});
