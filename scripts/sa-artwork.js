#!/usr/bin/env node
const fs = require('node:fs');
const { parseArgs } = require('node:util');
const { ArtworkWorkflow } = require('./artwork/workflow');
function run(args) {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
        asset: { type: 'string' }, theme: { type: 'string' }, attempt: { type: 'string' }, job: { type: 'string' }, file: { type: 'string' }, workspace: { type: 'string' }, status: { type: 'string' }, note: { type: 'string' }, 'from-attempt': { type: 'string' }, 'alpha-threshold': { type: 'string' }, 'metadata-file': { type: 'string' }, 'feedback-file': { type: 'string' }, 'proof-file': { type: 'string' }, fit: { type: 'boolean' }, approve: { type: 'boolean' }, check: { type: 'boolean' }
    } });
    const workflow = new ArtworkWorkflow({ workspace: values.workspace });
    const json = option => values[option] ? JSON.parse(fs.readFileSync(values[option], 'utf8')) : undefined;
    let result;
    switch (positionals[0]) {
    case 'prepare': result = workflow.prepare(values); break;
    case 'record': result = workflow.record({ ...values, metadata: json('metadata-file'), fromAttempt: values['from-attempt'], alphaThreshold: values['alpha-threshold'] ? Number(values['alpha-threshold']) : 1 }); break;
    case 'revise': result = workflow.revise({ ...values, feedback: json('feedback-file') }); break;
    case 'validate': result = workflow.validate(values.attempt); break;
    case 'select': result = workflow.select({ ...values, proof: json('proof-file') }); break;
    case 'review': {
        const html = workflow.review(values);
        const file = workflow.local(`gallery/review-${Date.now()}.html`);
        fs.writeFileSync(file, html, { flag: 'wx' });
        result = { file }; break;
    }
    case 'release':
        if (!values.check) throw new Error('release requires --check; packaging waits for proven imports');
        result = workflow.releaseCheck(); break;
    default: throw new Error('Usage: sa:art prepare|record|revise|validate|review|select|release --check');
    }
    console.log(JSON.stringify(result, null, 2));
    if (result.valid === false) process.exitCode = 1;
}
if (require.main === module) {
    try { run(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { run };
