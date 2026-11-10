const fs = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { PNG } = require('pngjs');
const { generateAssets } = require('../scripts/sa-assets');
test('generated celebration and status PNGs are transparent, correctly tiled and deterministic', () => {
    const dir = fs.mkdtempSync(join(tmpdir(), 'sa-assets-'));
    try {
        generateAssets(dir); const files = fs.readdirSync(dir).sort();
        expect(files.filter(name => name.endsWith('.json'))).toHaveLength(53);
        expect(files).toContain('sa_bridge_unknown.json');
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

test.each([['sa_separator', ' - '], ['sa_from', ' FROM '], ['sa_donations', ' DONATIONS - '], ['sa_raised', ' RAISED!']])('fixed recognition phrase %s has the expected dimensions', (name, text) => {
    const manifest = JSON.parse(fs.readFileSync(`integrations/stream-avatars/assets/${name}.json`));
    expect(manifest).toMatchObject({ name, frameWidth: text.length * 18 - 1, frameHeight: 23, frames: 1, transparent: true });
});

test('all uppercase name characters and requested symbols have visible pixel glyphs',()=>{
    const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:-\'"?';
    for(const [index,char] of [...alphabet].entries()) {
        if(char===' ') continue;
        const name=/^[0-9]$/.test(char) ? 'sa_digit_'+char : char==='.' ? 'sa_dot' : char===',' ? 'sa_comma' : 'sa_name_'+String(index).padStart(2,'0');
        const manifest=JSON.parse(fs.readFileSync('integrations/stream-avatars/assets/'+name+'.json'));
        const png=PNG.sync.read(fs.readFileSync('integrations/stream-avatars/assets/'+name+'.png'));
        expect(manifest).toMatchObject({name,frameWidth:17,frameHeight:23,frames:1,transparent:true});
        expect([...png.data].some((value,i)=>i%4===3&&value>0)).toBe(true);
    }
});

test('name glyph generation reuses existing digits, periods, and commas',()=>{
    const directory=fs.mkdtempSync(join(tmpdir(),'sa-shared-glyphs-'));
    try {
        generateAssets(directory);
        for(const index of [26,27,28,29,30,31,32,33,34,35,37,38]) {
            const base='sa_name_'+String(index).padStart(2,'0');
            expect(fs.existsSync(join(directory,base+'.png'))).toBe(false);
            expect(fs.existsSync(join(directory,base+'.json'))).toBe(false);
        }
    } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});
