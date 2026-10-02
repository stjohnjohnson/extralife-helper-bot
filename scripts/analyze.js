#!/usr/bin/env node

const { parseArguments } = require('../src/analysis/options.js');
const { runAnalysis } = require('../src/analysis/run.js');

function main() {
    try {
        const options = parseArguments(process.argv.slice(2));
        const result = runAnalysis(options);
        process.stdout.write(`HTML report: ${result.htmlPath}\nJSON data: ${result.jsonPath}\n`);
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

main();
