const fs = require('node:fs');
const { resolve, join } = require('node:path');
const { PNG } = require('pngjs');
// Original 5x7 bitmap alphabet. No host text API or external font is required.
const font = {
    '0':['01110','10001','10011','10101','11001','10001','01110'], '1':['00100','01100','00100','00100','00100','00100','01110'],
    '2':['01110','10001','00001','00010','00100','01000','11111'], '3':['11110','00001','00001','01110','00001','00001','11110'],
    '4':['00010','00110','01010','10010','11111','00010','00010'], '5':['11111','10000','10000','11110','00001','00001','11110'],
    '6':['01110','10000','10000','11110','10001','10001','01110'], '7':['11111','00001','00010','00100','01000','01000','01000'],
    '8':['01110','10001','10001','01110','10001','10001','01110'], '9':['01110','10001','10001','01111','00001','00001','01110'],
    A:['01110','10001','10001','11111','10001','10001','10001'], C:['01111','10000','10000','10000','10000','10000','01111'],
    D:['11110','10001','10001','10001','10001','10001','11110'], E:['11111','10000','10000','11110','10000','10000','11111'],
    F:['11111','10000','10000','11110','10000','10000','10000'], G:['01111','10000','10000','10111','10001','10001','01111'],
    H:['10001','10001','10001','11111','10001','10001','10001'], I:['11111','00100','00100','00100','00100','00100','11111'],
    K:['10001','10010','10100','11000','10100','10010','10001'], L:['10000','10000','10000','10000','10000','10000','11111'],
    M:['10001','11011','10101','10101','10001','10001','10001'], N:['10001','11001','10101','10011','10001','10001','10001'],
    O:['01110','10001','10001','10001','10001','10001','01110'], R:['11110','10001','10001','11110','10100','10010','10001'],
    S:['01111','10000','10000','01110','00001','00001','11110'], T:['11111','00100','00100','00100','00100','00100','00100'],
    U:['10001','10001','10001','10001','10001','10001','01110'], X:['10001','10001','01010','00100','01010','10001','10001'],
    Y:['10001','10001','01010','00100','00100','00100','00100'], '!':['00100','00100','00100','00100','00100','00000','00100'],
    '$':['00100','01111','10100','01110','00101','11110','00100'], ',':['00000','00000','00000','00000','00000','00100','01000'],
    '.':['00000','00000','00000','00000','00000','00000','00100'], ' ':Array(7).fill('00000')
};
function pixel(png, x, y, color) { if (x < 0 || y < 0 || x >= png.width || y >= png.height) return; const at = (y * png.width + x) * 4; color.forEach((v,i) => { png.data[at+i] = v; }); }
function caption(text) {
    const image = new PNG({ width: (text.length * 6 - 1) * 3 + 2, height: 23 });
    for (const [i, char] of [...text].entries()) for (const [y, row] of font[char].entries()) for (let x = 0; x < 5; x++) if (row[x] === '1') {
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) pixel(image, i*18+x*3+dx+2,y*3+dy+2,[36,25,9,240]);
    }
    for (const [i, char] of [...text].entries()) for (const [y, row] of font[char].entries()) for (let x = 0; x < 5; x++) if (row[x] === '1') {
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) pixel(image, i*18+x*3+dx,y*3+dy,[255,225,125,255]);
    }
    return image;
}
function generateAssets(directory = resolve(__dirname, '../integrations/stream-avatars/assets')) {
    fs.mkdirSync(directory, { recursive: true });
    function save(name, image, frames = 1, frameWidth = image.width, fps = 1) {
        fs.writeFileSync(join(directory, name + '.png'), PNG.sync.write(image));
        fs.writeFileSync(join(directory, name + '.json'), JSON.stringify({ name, file: name + '.png', frameWidth, frameHeight: image.height, frames, rows: 1, framesPerSecond: fps, loop: true, transparent: true }, null, 2) + '\n');
    }
    for (let i=0;i<10;i++) save('sa_digit_' + i, caption(String(i)));
    for (const [name,text] of Object.entries({ sa_dollar: '$', sa_comma: ',', sa_dot: '.', sa_thanks: 'THANK YOU!', sa_raised: ' RAISED THIS STREAM!', sa_goal: 'EXTRA LIFE GOAL REACHED!' })) save(name, caption(text));
    const confetti = new PNG({ width: 32, height: 8 });
    for (let frame=0;frame<4;frame++) for (let y=1;y<7;y++) for (let x=1;x<7;x++) if (Math.abs(x-3)<(frame%2 ? 1 : 3)) pixel(confetti,frame*8+x,y,[255,185+frame*15,40+frame*20,240]);
    save('sa_confetti',confetti,4,8,8);
    const accent = new PNG({ width: 32, height: 32 });
    for (let y=1;y<31;y++) for (let x=1;x<31;x++) if (Math.abs(x-15.5)+Math.abs(y-15.5)<14 && (Math.abs(x-15.5)<4 || Math.abs(y-15.5)<4)) pixel(accent,x,y,[255,230,140,255]);
    save('sa_goal_accent',accent);
}
if (require.main === module) generateAssets();
module.exports = { generateAssets };
