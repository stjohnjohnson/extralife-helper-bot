const { parseReleaseMetadata } = require('./pr-release-metadata');

// Extend the existing generator's writer; it owns commit parsing, Markdown
// rendering, the version header, and breaking-change footers.
const mainTemplate = `{{> header}}

{{#if releaseNotes}}
### Changes

{{#each releaseNotes}}
- {{text}} ([#{{number}}]({{url}}))
{{/each}}
{{else}}
Internal maintenance; no user-facing changes.
{{/if}}
{{#if upgradeActions}}

### Upgrade actions

{{#each upgradeActions}}
- {{text}} ([#{{number}}]({{url}}))
{{/each}}
{{/if}}
{{> footer}}
`;

async function finalizeContext(context, commits, { fetchImpl, token }) {
    if (context.host !== 'https://github.com' || !/^[\w.-]+$/.test(context.owner || '') || !/^[\w.-]+$/.test(context.repository || '')) {
        throw new Error('Configure a valid github.com repository for release notes.');
    }
    const slug = `${context.owner}/${context.repository}`;
    const repositoryUrl = `${context.host}/${slug}`;
    const hashes = new Set(commits.map(commit => commit.hash));
    const prs = new Map(), mapped = new Set();
    for (const commit of commits) {
        if (!token) throw new Error('Set GITHUB_TOKEN or GH_TOKEN to read release PR notes.');
        if (!/^[a-f0-9]{40}$/.test(commit.hash)) throw new Error('Release commits require full Git SHA values.');
        const endpoint = `https://api.github.com/repos/${slug}/commits/${commit.hash}/pulls`;
        let url = `${endpoint}?per_page=100`;
        const seen = new Set();
        while (url) {
            const page = new URL(url);
            if (seen.has(url) || page.origin !== 'https://api.github.com' || page.pathname !== new URL(endpoint).pathname || page.username || page.password) {
                throw new Error('Invalid GitHub release metadata pagination.');
            }
            seen.add(url);
            let response;
            try {
                response = await fetchImpl(url, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
                    signal: AbortSignal.timeout(15000), redirect: 'error' });
            } catch { throw new Error('GitHub release metadata request failed or timed out.'); }
            if (!response.ok) throw new Error(`GitHub release metadata request failed (${response.status}).`);
            let data;
            try { data = await response.json(); } catch { throw new Error('Invalid GitHub release metadata response.'); }
            if (!Array.isArray(data)) throw new Error('Invalid GitHub release metadata response.');
            for (const pr of data) {
                if (!pr.merged_at || pr.base?.ref !== 'main' || !hashes.has(pr.merge_commit_sha)) continue;
                if (!Number.isSafeInteger(pr.number) || pr.number <= 0 || !Number.isFinite(Date.parse(pr.merged_at))) throw new Error('Invalid GitHub release PR metadata.');
                if (!prs.has(pr.number)) prs.set(pr.number, { ...pr, commits: [] });
                prs.get(pr.number).commits.push(commit);
                mapped.add(commit.hash);
            }
            url = response.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
        }
    }
    for (const commit of commits) {
        const releasing = ['feat', 'fix', 'perf'].includes(commit.type) || commit.revert || commit.notes.length;
        if (releasing && !mapped.has(commit.hash)) throw new Error(`Release commit ${commit.hash.slice(0, 7)} is not associated with a merged PR; supply reviewed release notes.`);
    }
    const ordered = [...prs.values()].sort((a, b) => a.merged_at.localeCompare(b.merged_at) || a.number - b.number);
    const parsed = new Map(), replaced = new Set();
    for (const pr of ordered) {
        const record = parseReleaseMetadata(pr, { breaking: pr.commits.some(commit => commit.notes.length) });
        for (const number of record.replacements) {
            const target = parsed.get(number);
            if (!target || target.internal) throw new Error(`PR #${pr.number}: replacement must reference an earlier user-facing PR in this release.`);
            if (target.upgrades.length && !record.upgrades.length) throw new Error(`PR #${pr.number}: restate applicable upgrade actions from #${number}.`);
            replaced.add(number);
        }
        parsed.set(pr.number, record);
    }
    const active = ordered.filter(pr => !replaced.has(pr.number));
    const fields = name => active.flatMap(pr => parsed.get(pr.number)[name].map(text => ({ text, number: pr.number, url: `${repositoryUrl}/pull/${pr.number}` })));
    return { ...context, releaseNotes: fields('notes'), upgradeActions: fields('upgrades') };
}

module.exports = ({ fetchImpl = fetch, token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN } = {}) => ({
    mainTemplate,
    // Retain all parsed commits for PR lookup, including maintenance that the
    // default Angular transform omits. Leave parsed notes/reverts untouched.
    transform: commit => commit,
    skip: commit => /^chore\(release\):/.test(commit.message),
    finalizeContext: (context, _options, _filtered, _key, commits) => finalizeContext(context, commits, { fetchImpl, token })
});
