const fs = require('node:fs');
const { parseReleaseMetadata } = require('./pr-release-metadata');

function validatePR(pr) {
    if (!pr || !Number.isSafeInteger(pr.number) || pr.number <= 0 || typeof pr.title !== 'string' ||
        !(typeof pr.body === 'string' || pr.body === null) || typeof pr.user?.login !== 'string' || typeof pr.user.type !== 'string') {
        throw new Error('Invalid pull request event. Supply number, title, body, and author metadata.');
    }
}

async function main() {
    const args = process.argv.slice(2);
    const live = args.includes('--live');
    let event;
    try {
        const eventPath = args.find(arg => arg !== '--live') || process.env.GITHUB_EVENT_PATH;
        event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    } catch { throw new Error('Cannot read pull request event. Set GITHUB_EVENT_PATH or supply a JSON event file path.'); }
    let pr = event?.pull_request;
    validatePR(pr);
    if (live) {
        const owner = event.repository?.owner?.login, repo = event.repository?.name;
        if (!/^[\w.-]+$/.test(owner || '') || !/^[\w.-]+$/.test(repo || '')) throw new Error('Invalid pull request event repository metadata.');
        const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
        if (!token) throw new Error('Set GITHUB_TOKEN or GH_TOKEN to read current PR metadata.');
        const number = pr.number;
        const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`;
        let response;
        try {
            response = await fetch(url, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(15000), redirect: 'error' });
        } catch { throw new Error('GitHub current PR metadata request failed or timed out.'); }
        if (!response.ok) throw new Error(`GitHub current PR metadata request failed (${response.status}).`);
        try { pr = await response.json(); } catch { throw new Error('Invalid GitHub current PR metadata response.'); }
        validatePR(pr);
        if (pr.number !== number) throw new Error('Invalid GitHub current PR metadata response.');
    }
    const result = parseReleaseMetadata(pr);
    console.log(`PR #${pr.number}: release metadata is valid (${result.notes.length} release note entries, ${result.upgrades.length} upgrade entries).`);
}

main().catch(error => {
    // PR descriptions are untrusted. Prevent control characters from emitting
    // additional GitHub workflow commands or breaking annotation boundaries.
    const message = error.message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.error(`::error title=PR release metadata::${message}`);
    process.exitCode = 1;
});
