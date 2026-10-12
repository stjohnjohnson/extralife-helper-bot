const fs = require('node:fs');
const path = require('node:path');
const { buildPackage } = require('../src/streamAvatars/package');

const DEFAULT_OUTPUT = path.resolve(__dirname, '../dist/stream-avatars/sa-helper-bridge.zip');
const USAGE = 'Usage: npm run sa:package -- [--output path/to/package.zip]';

function run(args = process.argv.slice(2)) {
    if (args.length && (args.length !== 2 || args[0] !== '--output' || !args[1] || !args[1].toLowerCase().endsWith('.zip'))) throw new Error(USAGE);
    const output = args.length ? path.resolve(args[1]) : DEFAULT_OUTPUT;
    const { archive, imageCount, soundCount, sounds } = buildPackage();
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, archive);
    const soundsDir = path.join(path.dirname(output), 'sounds');
    fs.mkdirSync(soundsDir, { recursive: true });
    for (const [name, bytes] of Object.entries(sounds)) fs.writeFileSync(path.join(soundsDir, name), bytes);
    console.log(`Created ${output} (${imageCount} images, ${soundCount} sounds). Configure the private address/token after import. Import the bundled Oggs once through Stream Avatars Sounds: ${soundsDir}`);
}

if (require.main === module) {
    try { run(); }
    catch (error) { console.error(`Unable to package Stream Avatars: ${error.message}`); process.exitCode = 1; }
}
module.exports = { run };
