const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { repositoryIdentity, loadReleasePrs } = require('./release-notes/github');
const { renderReleaseNotes } = require('./release-notes/render');

async function main(args = process.argv.slice(2), { cwd = process.cwd(), env = process.env, fetchImpl } = {}) {
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i];
        if (!['--from', '--to', '--candidate-event', '--fixture'].includes(key) || !args[i + 1] || options[key]) {
            throw new Error('Usage: release:preview -- --from REF --to REF [--candidate-event PATH], or --fixture PATH');
        }
        options[key] = args[i + 1];
    }
    let notes;
    if (options['--fixture']) {
        if (Object.keys(options).length !== 1) throw new Error('Use --fixture without other arguments.');
        notes = renderReleaseNotes(JSON.parse(fs.readFileSync(options['--fixture'], 'utf8')));
    } else {
        if (!options['--from'] || !options['--to']) throw new Error('Specify --from REF and --to REF.');
        const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
        const resolve = ref => git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
        const from = resolve(options['--from']);
        const to = resolve(options['--to']);
        const hashes = git(['rev-list', '--reverse', `${from}..${to}`]).split('\n').filter(Boolean);
        const commits = hashes.map(hash => ({ hash, message: git(['show', '-s', '--format=%B', hash]) }));
        const identity = repositoryIdentity(git(['remote', 'get-url', 'origin']));
        let candidate;
        let event;
        let lookup = commits;
        if (options['--candidate-event']) {
            event = JSON.parse(fs.readFileSync(options['--candidate-event'], 'utf8'));
            const pr = event.pull_request;
            if (!pr || event.repository?.full_name !== `${identity.owner}/${identity.repo}` || pr.base?.repo?.full_name !== event.repository.full_name) {
                throw new Error('Candidate event must describe a PR for this repository.');
            }
            const base = resolve(pr.base.sha);
            const head = resolve(pr.head.sha);
            const candidateHashes = git(['rev-list', `${base}..${head}`]).split('\n').filter(Boolean);
            if (!hashes.includes(head)) throw new Error('Candidate head is outside the preview range.');
            candidate = { number: pr.number, title: pr.title, body: pr.body, htmlUrl: pr.html_url, base: 'main',
                mergedAt: null, mergeCommitSha: head, commitHashes: candidateHashes, author: pr.user, candidate: true };
            lookup = commits.filter(commit => !candidateHashes.includes(commit.hash));
        }
        let prs;
        try {
            prs = await loadReleasePrs({ ...identity, commits: lookup, token: env.GITHUB_TOKEN || env.GH_TOKEN, fetchImpl });
        } catch (error) {
            const fork = event?.pull_request.head.repo?.full_name !== event?.pull_request.base.repo?.full_name;
            if (candidate && fork && error.code === 'EGITHUBRELEASENOTES') {
                console.log('Combined release preview unavailable: fork token cannot read all release metadata. PR description validation remains required.');
                return;
            }
            throw error;
        }
        notes = renderReleaseNotes({ ...identity, commits, prs: candidate ? [...prs, candidate] : prs,
            lastRelease: {}, nextRelease: {} });
    }
    console.log(notes);
    if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, notes + '\n');
    return notes;
}

if (require.main === module) {
    main().catch(error => {
        // Child-process errors can contain git output; do not print it or credentials.
        console.error(error.code && error.code !== 'EGITHUBRELEASENOTES' ? 'Release preview failed: check refs, event file, and repository access.' : error.message);
        process.exitCode = 1;
    });
}

module.exports = { main };
