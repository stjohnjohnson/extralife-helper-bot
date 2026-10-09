const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { buildPackage } = require('../src/streamAvatars/package');

const DEFAULT_OUTPUT = path.resolve(__dirname, '../dist/stream-avatars/sa-helper-bridge.zip');
const USAGE = 'Usage: npm run sa:package -- [--output path/to/package.zip] [--candidate-pack LOCAL_DIR | --theme-pack LOCAL_DIR]';

function run(args = process.argv.slice(2)) {
    let values;
    try { ({ values } = parseArgs({ args, options: { output: { type: 'string' }, 'candidate-pack': { type: 'string' }, 'theme-pack': { type: 'string' } } })); } catch { throw new Error(USAGE); }
    if ((values.output && !values.output.toLowerCase().endsWith('.zip')) || (values['candidate-pack'] && values['theme-pack'])) throw new Error(USAGE);
    const output = values.output ? path.resolve(values.output) : DEFAULT_OUTPUT;
    const { archive, imageCount, packRevision } = buildPackage({ themePackDir: values['candidate-pack'] || values['theme-pack'], previewOnly: !!values['candidate-pack'] });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, archive);
    console.log(`Created ${output} (${imageCount} image${imageCount === 1 ? '' : 's'}, revision ${packRevision}). Configure the private address/token after import.`);
}

if (require.main === module) {
    try { run(); }
    catch (error) { console.error(`Unable to package Stream Avatars: ${error.message}`); process.exitCode = 1; }
}
module.exports = { run };
