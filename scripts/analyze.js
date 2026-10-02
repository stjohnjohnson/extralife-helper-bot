#!/usr/bin/env node

const fs = require('fs');
const { parseArguments } = require('../src/analysis/options.js');
const { parseLog } = require('../src/analysis/parser.js');

function main() {
    try {
        const options = parseArguments(process.argv.slice(2));
        const result = parseLog(fs.readFileSync(options.inputPath, 'utf8'));
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

main();
