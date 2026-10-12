function repositoryIdentity(value) {
    try {
        const url = new URL(value.replace(/^git@github\.com:/, 'https://github.com/'));
        const match = url.pathname.replace(/\.git$/, '').match(/^\/([\w.-]+)\/([\w.-]+)\/?$/);
        if (url.hostname !== 'github.com' || !match || !['https:', 'ssh:'].includes(url.protocol)) {
            throw new Error();
        }
        return { owner: match[1], repo: match[2], repositoryUrl: `https://github.com/${match[1]}/${match[2]}` };
    } catch {
        throw new Error('Configure a valid github.com repository URL for release notes.');
    }
}

function metadataError(message) {
    const error = new Error(message);
    error.code = 'EGITHUBRELEASENOTES';
    return error;
}

async function request(url, token, fetchImpl) {
    for (let attempt = 0; attempt <= 2; attempt++) {
        let result;
        try {
            result = await fetchImpl(url, {
                headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
                signal: AbortSignal.timeout(15000), redirect: 'error'
            });
        } catch {
            if (attempt === 2) {
                throw metadataError('GitHub release metadata request failed or timed out.');
            }
        }
        if (result?.ok) {
            try {
                const data = await result.json();
                if (!Array.isArray(data)) throw new Error();
                return { data, link: result.headers.get('link') || '' };
            } catch {
                throw metadataError('Unexpected GitHub release metadata response.');
            }
        }
        if (result && (!(result.status === 429 || result.status >= 500) || attempt === 2)) {
            throw metadataError(`GitHub release metadata request failed (${result.status}).`);
        }
        await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt));
    }
}

async function loadReleasePrs({ owner, repo, commits, token, fetchImpl = fetch }) {
    if (!/^[\w.-]+$/.test(owner || '') || !/^[\w.-]+$/.test(repo || '')) {
        throw new Error('Specify a valid GitHub owner and repository.');
    }
    const relevant = commits.filter(commit => !/^chore\(release\):/.test(commit.message));
    if (!relevant.length) return [];
    if (!token) throw metadataError('Set GITHUB_TOKEN or GH_TOKEN to read release PR metadata.');
    const hashes = new Set(commits.map(commit => commit.hash));
    const prs = new Map();
    for (const commit of relevant) {
        if (!/^[a-f0-9]{40}$/.test(commit.hash)) throw new Error('Release commit hashes must be full Git SHA values.');
        const endpoint = `https://api.github.com/repos/${owner}/${repo}/commits/${commit.hash}/pulls`;
        let url = `${endpoint}?per_page=100`;
        const seen = new Set();
        while (url) {
            if (seen.has(url)) throw metadataError('Cyclic GitHub release metadata pagination.');
            seen.add(url);
            const result = await request(url, token, fetchImpl);
            for (const pr of result.data) {
                if (!pr.merged_at || pr.base?.ref !== 'main' || !hashes.has(pr.merge_commit_sha)) continue;
                if (!prs.has(pr.number)) {
                    prs.set(pr.number, { number: pr.number, title: pr.title, body: pr.body, htmlUrl: pr.html_url,
                        mergedAt: pr.merged_at, mergeCommitSha: pr.merge_commit_sha, base: pr.base.ref, author: pr.user, commitHashes: [] });
                }
                const record = prs.get(pr.number);
                if (!record.commitHashes.includes(commit.hash)) record.commitHashes.push(commit.hash);
            }
            const next = result.link.match(/<([^>]+)>;\s*rel="next"/)?.[1];
            if (next) {
                let parsed;
                try { parsed = new URL(next); } catch { throw metadataError('Invalid GitHub release metadata pagination.'); }
                if (parsed.origin !== 'https://api.github.com' || parsed.pathname !== new URL(endpoint).pathname || parsed.username || parsed.password || seen.has(next)) {
                    throw metadataError('Invalid GitHub release metadata pagination.');
                }
            }
            url = next;
        }
    }
    return [...prs.values()];
}

module.exports = { repositoryIdentity, loadReleasePrs };
