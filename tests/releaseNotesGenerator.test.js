const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { loadReleasePrs, repositoryIdentity } = require('../scripts/release-notes/github');
const { renderReleaseNotes } = require('../scripts/release-notes/render');
const { generateNotes } = require('../scripts/release-notes/plugin');
const { main: preview } = require('../scripts/preview-release-notes');
const fixture = require('./fixtures/releases/v4.9.0.json');
const hash = number => number.toString(16).padStart(40, '0');
const clone = () => JSON.parse(JSON.stringify(fixture));
const apiPr = pr => ({ number: pr.number, title: pr.title, body: pr.body, html_url: pr.htmlUrl,
    merged_at: pr.mergedAt, merge_commit_sha: pr.mergeCommitSha, base: { ref: pr.base }, user: pr.author });
const response = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers });

describe('curated release notes', () => {
    test('the historical review fixture describes final behavior and upgrade actions', () => {
        const notes = renderReleaseNotes(clone());
        expect(notes).toContain('campaign milestones');
        expect(notes).toContain('restore private address/token');
        expect(notes).toContain('/compare/v4.8.0...v4.9.0');
        for (const retired of ['broadcast sessions', 'rehearsal controls', 'install CI', 'hi#water', '1111111', '/pull/71', '/pull/79']) {
            expect(notes).not.toContain(retired);
        }
    });

    test('renders a PR once despite many intermediate commits and input ordering', () => {
        const data = clone();
        data.commits.push({ hash: hash(4), message: 'feat: intermediate implementation' });
        data.prs[1].commitHashes.push(hash(4));
        expect(renderReleaseNotes({ ...data, prs: data.prs.reverse() })).toBe(renderReleaseNotes(clone()));
    });

    test.each(['missing', 'self', 'cycle', 'older'])('rejects invalid replacements: %s', kind => {
        const data = clone();
        if (kind === 'missing') data.prs[1].body = data.prs[1].body.replace('#71 -->', '#999 -->');
        if (kind === 'self') data.prs[1].body = data.prs[1].body.replace('#71 -->', '#72 -->');
        if (kind === 'cycle') data.prs[0].body += '<!-- replaces-release-notes: #72 -->';
        if (kind === 'older') data.prs[1].mergedAt = '2026-10-11T00:00:00Z';
        expect(() => renderReleaseNotes(data)).toThrow(/replac/i);
    });

    test('supports replacement chains, with upgrades authored in the final replacement', () => {
        const data = clone();
        const newer = { ...data.prs[1], number: 82, mergedAt: '2026-10-13T00:00:00Z', mergeCommitSha: hash(5), commitHashes: [hash(5)], htmlUrl: `${data.repositoryUrl}/pull/82`, body: data.prs[1].body.replace('#71 -->', '#72 -->') };
        data.prs.push(newer);
        data.commits.push({ hash: hash(5), message: 'feat: final celebrations' });
        const notes = renderReleaseNotes(data);
        expect(notes).toContain('/pull/82');
        expect(notes).not.toContain('/pull/72');
        expect(notes).toContain('restore private address/token');
    });

    test('does not silently drop upgrade actions when replacing an unreleased PR', () => {
        const data = clone();
        data.prs[1].body = data.prs[1].body.replace('- Import the latest companion package and restore private address/token settings after reimporting.', 'None.');
        expect(() => renderReleaseNotes(data)).toThrow(/upgrade/i);
    });

    test('rejects malformed descriptions and internal-only breaking changes', () => {
        const data = clone();
        data.prs[1].body = '';
        expect(() => renderReleaseNotes(data)).toThrow(/#72/);
        data.prs[1] = { ...fixture.prs[2], title: 'feat!: incompatible protocol' };
        expect(() => renderReleaseNotes(data)).toThrow(/release notes/i);
    });

    test('preserves explicit multiline breaking-change footers without inferring issue links', () => {
        const data = clone();
        data.commits[1].message += '\n\nBREAKING CHANGE: Upgrade bot and companion together.\nRestore private settings.\n\nCloses #67';
        const notes = renderReleaseNotes(data);
        expect(notes).toContain('### Breaking changes');
        expect(notes).toContain('Upgrade bot and companion together.');
        expect(notes).toContain('Restore private settings.');
        expect(notes).not.toContain('Closes #67');
    });

    test('rejects release-relevant direct commits with no PR and ignores release bookkeeping', () => {
        const data = clone();
        data.commits.push({ hash: hash(8), message: 'fix: directly change application behavior' });
        expect(() => renderReleaseNotes(data)).toThrow(/not associated with a merged PR/);
        data.commits.pop();
        data.commits.push({ hash: hash(9), message: 'chore(release): 4.9.0 [skip ci]' });
        expect(renderReleaseNotes(data)).toBe(renderReleaseNotes(clone()));
    });

    test('authored notes never generate links from free-form commit prose', () => {
        const data = clone();
        data.commits[1].message += '\n\nBound threshold history using a high-water count.';
        expect(renderReleaseNotes(data)).not.toContain('hi#water');
    });

    test.each(['breaking change: Upgrade runtime.', '  BREAKING CHANGE: Upgrade runtime.', '* Breaking Change: Upgrade runtime.'])('renders breaking notices recognized by the analyzer: %s', footer => {
        const data = clone();
        data.commits[1].message += '\n\n' + footer;
        expect(renderReleaseNotes(data)).toContain('### Breaking changes\n\n- Upgrade runtime.');
        data.commits[2].message += '\n\n' + footer;
        expect(() => renderReleaseNotes(data)).toThrow(/breaking changes require release notes/);
    });

    test.each(['perf: reduce donation polling latency', 'Revert "feat: remove captions"\n\nThis reverts commit abc1234.'])('requires PR notes for analyzer-relevant commits: %s', message => {
        const data = clone();
        data.commits.push({ hash: hash(8), message });
        expect(() => renderReleaseNotes(data)).toThrow(/not associated with a merged PR/);
    });

    test('validates source PR URLs instead of trusting arbitrary metadata links', () => {
        const data = clone();
        data.prs[1].htmlUrl = 'https://example.com/pull/72';
        expect(() => renderReleaseNotes(data)).toThrow(/URL/);
    });

    test('internal-only patch releases have an honest maintenance summary', () => {
        const data = clone();
        data.prs = [data.prs[2]];
        data.commits = [data.commits[2]];
        expect(renderReleaseNotes(data)).toContain('Internal maintenance; no user-facing changes.');
    });

    test('Dependabot maintenance can accompany normal release PRs without noisy notes', () => {
        const data = clone();
        data.prs[2] = { ...data.prs[2], title: 'chore(deps-dev): update dependencies', body: '', author: { login: 'dependabot[bot]', type: 'Bot' } };
        expect(renderReleaseNotes(data)).not.toContain('dependencies');
    });
});

describe('GitHub release inputs', () => {
    test.each(['git@github.com:stjohnjohnson/extralife-helper-bot.git', 'https://github.com/stjohnjohnson/extralife-helper-bot.git', 'ssh://git@github.com/stjohnjohnson/extralife-helper-bot.git'])('normalizes the configured repository URL: %s', url => {
        expect(repositoryIdentity(url)).toEqual({ owner: 'stjohnjohnson', repo: 'extralife-helper-bot', repositoryUrl: fixture.repositoryUrl });
    });

    test('loads only merged-main PRs whose merge commit is in the release range', async () => {
        const data = clone();
        const old = { ...data.prs[0], number: 12, mergeCommitSha: hash(99) };
        const unmerged = { ...data.prs[0], number: 13, mergedAt: null };
        const otherBase = { ...data.prs[0], number: 14, base: 'other' };
        const fetchImpl = jest.fn(async () => response([old, unmerged, otherBase, apiPr(data.prs[0])].map(pr => pr.html_url ? pr : apiPr(pr))));
        const result = await loadReleasePrs({ owner: 'stjohnjohnson', repo: 'extralife-helper-bot', commits: [data.commits[0]], token: 'private-token', fetchImpl });
        expect(result.map(pr => pr.number)).toEqual([71]);
        expect(result[0].commitHashes).toEqual([data.commits[0].hash]);
        expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer private-token');
        expect(fetchImpl.mock.calls[0][1].signal).toBeDefined();
    });

    test('follows pagination and deduplicates PRs across commit associations', async () => {
        const data = clone();
        const next = `https://api.github.com/repos/stjohnjohnson/extralife-helper-bot/commits/${data.commits[0].hash}/pulls?per_page=100&page=2`;
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(response([], 200, { link: `<${next}>; rel="next"` }))
            .mockResolvedValueOnce(response([apiPr(data.prs[0])]))
            .mockResolvedValueOnce(response([apiPr(data.prs[0])]));
        const result = await loadReleasePrs({ owner: 'stjohnjohnson', repo: 'extralife-helper-bot', commits: [data.commits[0], { hash: hash(4), message: 'feat: iteration' }], token: 'token', fetchImpl });
        expect(result).toHaveLength(1);
        expect(result[0].commitHashes).toEqual([data.commits[0].hash, hash(4)]);
        expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    test('never forwards credentials to foreign pagination URLs or follows pagination cycles', async () => {
        for (const next of ['https://example.com/steal', `https://api.github.com/repos/stjohnjohnson/extralife-helper-bot/commits/${fixture.commits[0].hash}/pulls?per_page=100`]) {
            const fetchImpl = jest.fn(async () => response([], 200, { link: `<${next}>; rel="next"` }));
            await expect(loadReleasePrs({ owner: 'stjohnjohnson', repo: 'extralife-helper-bot', commits: [fixture.commits[0]], token: 'secret', fetchImpl })).rejects.toThrow(/pagination/i);
            expect(fetchImpl).toHaveBeenCalledTimes(1);
        }
    });

    test('bounded transient retries can recover and permanent API errors remain credential-safe', async () => {
        const fetchImpl = jest.fn().mockResolvedValueOnce(response({}, 503)).mockResolvedValueOnce(response([apiPr(fixture.prs[0])]));
        await expect(loadReleasePrs({ owner: 'stjohnjohnson', repo: 'extralife-helper-bot', commits: [fixture.commits[0]], token: 'secret', fetchImpl })).resolves.toHaveLength(1);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        const denied = jest.fn(async () => response({ error: 'secret' }, 403));
        await expect(loadReleasePrs({ owner: 'stjohnjohnson', repo: 'extralife-helper-bot', commits: [fixture.commits[0]], token: 'secret', fetchImpl: denied })).rejects.toThrow('GitHub release metadata request failed (403).');
        expect(denied).toHaveBeenCalledTimes(1);
    });

    test('network failure/timeout diagnostics omit request tokens and stop after two retries', async () => {
        const fetchImpl = jest.fn(async () => { throw new Error('private-token'); });
        await expect(loadReleasePrs({ owner: 'stjohnjohnson', repo: 'extralife-helper-bot', commits: [fixture.commits[0]], token: 'private-token', fetchImpl })).rejects.toThrow('GitHub release metadata request failed or timed out.');
        expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    test('unexpected API response shapes fail instead of publishing partial notes', async () => {
        await expect(loadReleasePrs({ owner: 'stjohnjohnson', repo: 'extralife-helper-bot', commits: [fixture.commits[0]], token: 'token', fetchImpl: async () => response({}) })).rejects.toThrow(/response/);
    });
});

describe('release integration', () => {
    test('candidate preview maps local PR commits without fetching or publishing an unmerged PR', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-preview-'));
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        try {
            const git = args => {
                const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
                if (result.status !== 0) throw new Error(result.stderr);
                return result.stdout.trim();
            };
            git(['init', '--initial-branch=main']);
            git(['remote', 'add', 'origin', `${fixture.repositoryUrl}.git`]);
            const commit = message => git(['-c', 'user.name=Preview Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', message]);
            commit('chore: baseline');
            const base = git(['rev-parse', 'HEAD']);
            commit('feat: first implementation\n\nBREAKING CHANGE: Abandoned intermediate protocol.');
            commit('fix: correct unreleased implementation');
            const head = git(['rev-parse', 'HEAD']);
            const eventPath = path.join(dir, 'event.json');
            fs.writeFileSync(eventPath, JSON.stringify({ repository: { full_name: 'stjohnjohnson/extralife-helper-bot' }, pull_request: {
                number: 82, title: 'feat: donation celebrations', body: fixture.prs[1].body.replace('<!-- replaces-release-notes: #71 -->', '') + '\nBREAKING CHANGE: Import the final companion.',
                html_url: `${fixture.repositoryUrl}/pull/82`, user: { login: 'author', type: 'User' },
                base: { sha: base, repo: { full_name: 'stjohnjohnson/extralife-helper-bot' } }, head: { sha: head, repo: { full_name: 'stjohnjohnson/extralife-helper-bot' } }
            } }));
            const fetchImpl = jest.fn();
            const notes = await preview(['--from', base, '--to', head, '--candidate-event', eventPath], { cwd: dir, env: { GITHUB_TOKEN: 'token' }, fetchImpl });
            expect(notes).toContain('campaign milestones');
            expect(notes).toContain('/pull/82');
            expect(notes).toContain('### Breaking changes\n\n- Import the final companion.');
            expect(notes).not.toContain('Abandoned intermediate protocol.');
            expect(fetchImpl).not.toHaveBeenCalled();
            expect(git(['rev-parse', 'HEAD'])).toBe(head);
        } finally {
            log.mockRestore();
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('the plugin uses the same renderer with the actual repository configuration', async () => {
        const fetchImpl = jest.fn(async url => {
            const sha = /commits\/([^/]+)\/pulls/.exec(url)[1];
            return response(fixture.prs.filter(pr => pr.commitHashes.includes(sha)).map(apiPr));
        });
        const context = { commits: fixture.commits, lastRelease: fixture.lastRelease, nextRelease: fixture.nextRelease,
            options: { repositoryUrl: 'git@github.com:stjohnjohnson/extralife-helper-bot.git' }, env: { GITHUB_TOKEN: 'token' } };
        expect(await generateNotes({ fetchImpl }, context)).toBe(renderReleaseNotes(clone()));
        const config = require('../.releaserc.json');
        expect(config.plugins[0]).toBe('@semantic-release/commit-analyzer');
        expect(config.plugins[1]).toBe('./scripts/release-notes/plugin.js');
        expect(config.plugins).toContain('@semantic-release/changelog');
        expect(config.plugins).toContain('@semantic-release/github');
    });

    test('semantic-release can load the local plugin, and version analysis remains patch/minor/major', () => {
        const root = path.join(__dirname, '..');
        const normalizeUrl = pathToFileURL(path.join(root, 'node_modules/semantic-release/lib/plugins/normalize.js')).href;
        const script = `
            import normalize from ${JSON.stringify(normalizeUrl)};
            import { analyzeCommits } from '@semantic-release/commit-analyzer';
            const logger = {log(){},warn(){},success(){},error(){},scope(){return this;}};
            const context = {cwd:process.cwd(),options:{},logger,stdout:process.stdout,stderr:process.stderr};
            const hook = await normalize(context,'generateNotes','./scripts/release-notes/plugin.js',{});
            if (typeof hook !== 'function') throw new Error('Plugin did not load');
            const actual=[];
            for (const message of ['fix: repair captions','feat: add celebrations','feat: replace protocol\\n\\nBREAKING CHANGE: reimport companion',
                'chore: upgrade runtime\\n\\nbreaking change: Upgrade runtime.',
                'chore: upgrade runtime\\n\\n  BREAKING CHANGE: Upgrade runtime.',
                'chore: upgrade runtime\\n\\n* Breaking Change: Upgrade runtime.',
                'perf: reduce latency','Revert "feat: remove captions"\\n\\nThis reverts commit abc1234.']) {
                actual.push(await analyzeCommits({}, {...context,commits:[{message,hash:'a'.repeat(40)}]}));
            }
            process.stdout.write(JSON.stringify(actual));
        `;
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, encoding: 'utf8' });
        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual(['patch', 'minor', 'major', 'major', 'major', 'major', 'patch', 'patch']);
    });

    test('preview CLI creates readable Markdown from a fixture without mutating git or publishing', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-preview-'));
        try {
            const output = path.join(dir, 'summary.md');
            const root = path.join(__dirname, '..');
            const before = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout;
            const result = spawnSync(process.execPath, [path.join(root, 'scripts/preview-release-notes.js'), '--fixture', path.join(__dirname, 'fixtures/releases/v4.9.0.json')], { cwd: root, encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: output } });
            expect(result.status).toBe(0);
            expect(result.stdout).toContain('campaign milestones');
            expect(fs.readFileSync(output, 'utf8')).toContain('restore private address/token');
            expect(spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout).toBe(before);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('actual changelog and GitHub stages consume exactly the curated notes, with publishing stubbed', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-stages-'));
        try {
            const root = path.join(__dirname, '..');
            const prepareUrl = pathToFileURL(path.join(root, 'node_modules/@semantic-release/changelog/lib/prepare.js')).href;
            const publishUrl = pathToFileURL(path.join(root, 'node_modules/@semantic-release/github/lib/publish.js')).href;
            const notes = renderReleaseNotes(clone());
            const script = `
                import prepare from ${JSON.stringify(prepareUrl)};
                import publish from ${JSON.stringify(publishUrl)};
                import fs from 'node:fs/promises';
                const context={cwd:${JSON.stringify(dir)},options:{repositoryUrl:${JSON.stringify(fixture.repositoryUrl)}},
                    env:{GITHUB_TOKEN:'test-token'},branch:{name:'main',type:'release'},logger:{log(){}},
                    nextRelease:{gitTag:'v4.9.0',version:'4.9.0',notes:${JSON.stringify(notes)}}};
                await prepare({},context);
                let published;
                class StubOctokit { async request(route,release) {
                    if(route!=='POST /repos/{owner}/{repo}/releases') throw new Error('Unexpected API call');
                    published=release.body;
                    return {data:{html_url:'https://example.invalid/release',id:1}};
                }}
                await publish({},context,{Octokit:StubOctokit});
                process.stdout.write(JSON.stringify({published,changelog:await fs.readFile(context.cwd+'/CHANGELOG.md','utf8')}));
            `;
            const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, encoding: 'utf8' });
            expect(result.status).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({ published: notes, changelog: notes });
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
