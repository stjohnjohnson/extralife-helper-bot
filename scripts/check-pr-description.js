const fs = require('node:fs');
const { validatePrDescription } = require('./release-notes/contract');

function main(args = process.argv.slice(2)) {
    if (args.length !== 2 || args[0] !== '--event') {
        throw new Error('Usage: npm run pr:check -- --event PATH');
    }
    const event = JSON.parse(fs.readFileSync(args[1], 'utf8'));
    if (!event.pull_request) {
        throw new Error('The event must contain a pull_request.');
    }
    const pr = event.pull_request;
    const result = validatePrDescription({ title: pr.title, body: pr.body, author: pr.user });
    for (const warning of result.warnings) {
        console.warn(`PR description warning: ${warning}`);
    }
    for (const error of result.errors) {
        console.error(`PR description: ${error}`);
    }
    if (result.errors.length) {
        process.exitCode = 1;
    } else {
        console.log('PR description is complete. Review the release preview for accuracy.');
    }
    return result;
}

if (require.main === module) {
    try {
        main();
    } catch {
        console.error('PR description: provide a readable PR event JSON file with --event PATH.');
        process.exitCode = 1;
    }
}

module.exports = { main };
