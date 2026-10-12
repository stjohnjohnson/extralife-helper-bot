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

function section(body, name) {
    let heading, fence;
    const lines = [];
    for (const line of (body || '').replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)) {
        const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
        if (marker) {
            if (!fence) fence = marker[1];
            else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
        } else if (!fence && /^## /.test(line)) {
            heading = line.slice(3).trim();
            continue;
        }
        if (heading === name) lines.push(line);
    }
    return lines.join('\n').trim();
}

function bullets(text, pr, field) {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    const result = [];
    for (const line of lines) {
        if (/^[-*] \S/.test(line)) result.push(line.slice(2));
        else if (/^\s+\S/.test(line) && result.length) result[result.length - 1] += ' ' + line.trim();
        else throw new Error(`PR #${pr.number}: complete ${field} in the PR template.`);
    }
    if (!result.length || result.some(line => /^(?:TODO|TBD)$/i.test(line) || /\[(?:Describe|Insert|Replace)\b/i.test(line))) {
        throw new Error(`PR #${pr.number}: complete ${field} in the PR template.`);
    }
    return result;
}

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
        const breaking = pr.commits.some(commit => commit.notes.length) || /!:\s/.test(pr.title);
        const bot = pr.user?.login === 'dependabot[bot]' && pr.user.type === 'Bot' && /^chore\(deps(?:-[a-z]+)?\): /.test(pr.title) && !breaking;
        const notes = section(pr.body, 'Release notes');
        const upgrades = section(pr.body, 'Upgrade actions');
        const internal = bot || notes === 'Internal only.';
        if (internal && (breaking || /^feat(?:\([^()]+\))?!?:/.test(pr.title))) throw new Error(`PR #${pr.number}: features and breaking changes require release notes.`);
        const record = { internal, notes: internal ? [] : bullets(notes, pr, 'Release notes'),
            upgrades: bot || upgrades === 'None.' ? [] : bullets(upgrades, pr, 'Upgrade actions') };
        const refs = pr.body?.match(/<!--\s*replaces-release-notes:\s*([\s\S]*?)-->/)?.[1];
        if (refs !== undefined) {
            const references = refs.trim().split(/\s*,\s*/);
            if (internal || new Set(references).size !== references.length) throw new Error(`PR #${pr.number}: invalid release-note replacement.`);
            for (const ref of references) {
                const target = /^#[1-9]\d*$/.test(ref) && parsed.get(Number(ref.slice(1)));
                if (!target || target.internal) throw new Error(`PR #${pr.number}: replacement must reference an earlier user-facing PR in this release.`);
                if (target.upgrades.length && !record.upgrades.length) throw new Error(`PR #${pr.number}: restate applicable upgrade actions from ${ref}.`);
                replaced.add(Number(ref.slice(1)));
            }
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
