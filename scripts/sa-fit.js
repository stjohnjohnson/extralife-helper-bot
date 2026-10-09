#!/usr/bin/env node
const fs = require('node:fs');
const { buildFittingPlan, applyFittingPlan } = require('../src/streamAvatars/gearFitting');
try {
    const args = process.argv.slice(2), options = {};
    while (args.length) {
        const key = args.shift();
        if (['--apply', '--app-closed'].includes(key)) options[key] = true;
        else if (['--settings', '--plan', '--overrides'].includes(key) && args.length) options[key] = args.shift();
        else throw new Error('Usage: sa:fit --settings FILE --plan FILE [--overrides FILE] [--apply --app-closed]');
    }
    if (!options['--settings'] || !options['--plan']) throw new Error('Explicit --settings and --plan paths are required');
    if (options['--settings'] === options['--plan']) throw new Error('Plan must be separate from settings');
    if (options['--apply']) {
        const result = applyFittingPlan({ settingsPath: options['--settings'], plan: JSON.parse(fs.readFileSync(options['--plan'])), appClosed: options['--app-closed'] === true });
        console.log(`Applied provisional pivots to ${result.avatarCount} avatars. Private backup: ${result.backupPath}`);
    } else {
        const plan = buildFittingPlan({ sourceBytes: fs.readFileSync(options['--settings']), overrides: options['--overrides'] ? JSON.parse(fs.readFileSync(options['--overrides'])) : {} });
        fs.writeFileSync(options['--plan'], JSON.stringify(plan, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        console.log(`Review-only provisional plan: ${plan.avatars.length} avatars, ${plan.skipped.length} skipped. Native graphic fitting remains unproven.`);
    }
} catch (error) {
    // JSON parser and filesystem errors may contain source snippets; never print them.
    console.error(error instanceof SyntaxError || error.code ? 'Unable to read or write fitting files' : error.message);
    process.exitCode = 1;
}
