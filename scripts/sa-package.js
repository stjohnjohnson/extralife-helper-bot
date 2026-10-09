const fs = require('node:fs');
const path = require('node:path');
const { buildPackage } = require('../src/streamAvatars/package');

const DEFAULT_OUTPUT = path.resolve(__dirname, '../dist/stream-avatars/sa-helper-bridge.zip');
const USAGE = 'Usage: npm run sa:package -- [--output path/to/package.zip]';

function run(args = process.argv.slice(2)) {
    if (args.length && (args.length !== 2 || args[0] !== '--output' || !args[1] || !args[1].toLowerCase().endsWith('.zip'))) throw new Error(USAGE);
    const output = args.length ? path.resolve(args[1]) : DEFAULT_OUTPUT;
    const { archive, imageCount } = buildPackage();
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, archive);
    console.log(`Created ${output} (${imageCount} image${imageCount === 1 ? '' : 's'}). Configure the private URL/token after import.`);
}

if (require.main === module) {
    try { run(); }
    catch (error) { console.error(`Unable to package Stream Avatars: ${error.message}`); process.exitCode = 1; }
}
module.exports = { run };
