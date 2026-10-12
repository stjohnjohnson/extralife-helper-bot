const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { generateNotes } = require('../scripts/release-notes');
const url = 'https://github.com/stjohnjohnson/extralife-helper-bot';
const sha = n => String(n).padStart(40, '0');
const pr = (number, notes, upgrades = 'None.', extra = {}) => ({ number, title: 'feat: celebrate donations',
    body: `## Summary\nFinal behavior.\n## Release notes\n${notes}\n## Upgrade actions\n${upgrades}\n## Validation\n- Tests passed.`,
    merged_at: `2026-10-12T12:${String(number).padStart(2, '0')}:00Z`, merge_commit_sha: sha(number), base: { ref: 'main' },
    user: { type: 'User', login: 'author' }, ...extra });
const commit = (n, message = 'feat: celebrate donations') => ({ hash: sha(n), message });
const response = (data, status = 200, link = '') => new Response(JSON.stringify(data), { status, headers: { link } });
const context = commits => ({ commits, options: { repositoryUrl: url + '.git' }, env: { GITHUB_TOKEN: 'secret' },
    lastRelease: { gitTag: 'v4.8.0' }, nextRelease: { version: '4.9.0', gitTag: 'v4.9.0' } });
const render = (prs, commits = prs.map(p => ({ hash: p.merge_commit_sha, message: p.title }))) =>
    generateNotes({ fetchImpl: async () => response(prs) }, context(commits));

test('publishes final PR notes once, with retained upgrades and no intermediate or CI claims', async () => {
    const old = pr(1, '- Add broadcast sessions and rehearsal.', '- Import the companion.');
    const current = pr(2, '- Connect Stream Avatars for donation and campaign celebrations.', '- Reimport and restore private settings.');
    current.body += '\n<!-- replaces-release-notes: #1 -->';
    const internal = pr(3, 'Internal only.', 'None.', { title: 'fix: restore CI' });
    const notes = await render([internal, current, old], [commit(1), commit(2), commit(3, 'fix: restore CI'), commit(4, 'feat: intermediate rehearsal')]);
    expect(notes).toContain('# v4.9.0');
    expect(notes).toContain('/compare/v4.8.0...v4.9.0');
    expect(notes.match(/Connect Stream Avatars/g)).toHaveLength(1);
    expect(notes).toContain('### Upgrade actions\n\n- Reimport and restore private settings.');
    expect(notes).not.toMatch(/broadcast|rehearsal|restore CI|\/pull\/1\)/);
});

test('limits inputs to merged main PRs in this release', async () => {
    const valid = pr(2, '- Celebrate donations.');
    const notes = await render([valid, pr(1, '- Old.', 'None.'), pr(3, '- Unmerged.', 'None.', { merged_at: null }),
        pr(4, '- Other branch.', 'None.', { base: { ref: 'other' } })], [commit(2)]);
    expect(notes).toContain('Celebrate donations.');
    expect(notes).not.toMatch(/Old\.|Unmerged\.|Other branch\./);
});

test('keeps internal and authenticated Dependabot maintenance out of product notes', async () => {
    const bot = pr(1, '', 'None.', { title: 'chore(deps): update libraries', body: '', user: { login: 'dependabot[bot]', type: 'Bot' } });
    expect(await render([bot], [commit(1, bot.title)])).toContain('Internal maintenance; no user-facing changes.');
    await expect(render([{ ...bot, user: { ...bot.user, type: 'User' } }], [commit(1, bot.title)])).rejects.toThrow(/Release notes/);
});

test.each(['', '## Release notes\n- TODO\n## Upgrade actions\nNone.', '## Release notes\n- Shipped.'])('missing release fields fail clearly instead of generating raw commit lists: %s', body => {
    return expect(render([pr(1, '', 'None.', { body })])).rejects.toThrow(/PR #1/);
});

test('comments and fenced headings cannot introduce release sections', async () => {
    const item = pr(1, '- Celebrate donations.');
    item.body = '## Summary\n```markdown\n## Release notes\n- Wrong.\n```\n<!-- ## Release notes\n- Hidden. -->\n' + item.body;
    const notes = await render([item]);
    expect(notes).toContain('Celebrate donations.');
    expect(notes).not.toMatch(/Wrong|Hidden/);
});

test.each(['#1', '#99', '#0', '#1, #1'])('rejects self, missing or malformed replacements: %s', refs => {
    const item = pr(1, '- Celebrate donations.');
    item.body += `\n<!-- replaces-release-notes: ${refs} -->`;
    return expect(render([item])).rejects.toThrow(/replacement/i);
});

test('replacement chains keep final notes and cannot silently discard upgrades', async () => {
    const items = [pr(1, '- Original.', '- Reimport.'), pr(2, '- Revised.', '- Reimport.'), pr(3, '- Final.', '- Reimport.')];
    items[1].body += '\n<!-- replaces-release-notes: #1 -->';
    items[2].body += '\n<!-- replaces-release-notes: #2 -->';
    const notes = await render(items);
    expect(notes).toContain('Final.');
    expect(notes).not.toMatch(/Original\.|Revised\./);
    items[2].body = items[2].body.replace('- Reimport.', 'None.');
    await expect(render(items)).rejects.toThrow(/upgrade/i);
});

test.each(['breaking change: Reimport.', '  BREAKING CHANGE: Reimport.', '* Breaking Change: Reimport.'])('preserves breaking footers and rejects internal classification: %s', footer => {
    const item = pr(1, '- Use the updated companion.', '- Reimport.');
    const commits = [commit(1, 'chore: update protocol\n\n' + footer + '\nRestore settings.\n\nCloses #81')];
    return render([item], commits).then(async notes => {
        expect(notes).toContain('### Breaking changes\n\n- Reimport. Restore settings.');
        expect(notes).not.toContain('Closes #81');
        await expect(render([pr(1, 'Internal only.', 'None.', { title: 'chore: update protocol' })], commits)).rejects.toThrow(/breaking/i);
    });
});

test('features cannot be internal-only, including breaking Dependabot updates', async () => {
    await expect(render([pr(1, 'Internal only.')])).rejects.toThrow(/release notes/i);
    const bot = pr(1, '', 'None.', { title: 'chore(deps): update libraries', body: 'breaking change: Upgrade runtime.', user: { login: 'dependabot[bot]', type: 'Bot' } });
    await expect(render([bot], [commit(1, bot.title + '\n\n' + bot.body)])).rejects.toThrow(/Release notes/);
});

test.each(['perf: reduce latency', 'fix: repair captions', 'Revert "feat: captions"\n\nThis reverts commit abc1234.', 'chore: upgrade\n\nbreaking change: Upgrade runtime.'])('rejects unmapped release-relevant commits: %s', message => {
    return expect(render([], [commit(1, message)])).rejects.toThrow(/not associated/);
});

test('release bookkeeping is ignored without API reads or credentials', async () => {
    const input = context([commit(1, 'chore(release): 4.9.0 [skip ci]\n\nBREAKING CHANGE: Previous release already shipped.')]);
    input.env = {};
    const notes = await generateNotes({}, input);
    expect(notes).toContain('Internal maintenance');
    expect(notes).not.toContain('Previous release already shipped.');
});

test('paginates GitHub metadata while refusing foreign URLs and leaking no credentials', async () => {
    const next = `https://api.github.com/repos/stjohnjohnson/extralife-helper-bot/commits/${sha(1)}/pulls?per_page=100&page=2`;
    const fetchImpl = jest.fn().mockResolvedValueOnce(response([], 200, `<${next}>; rel="next"`)).mockResolvedValueOnce(response([pr(1, '- Shipped.')]));
    expect(await generateNotes({ fetchImpl }, context([commit(1)]))).toContain('Shipped.');
    for (const link of ['https://example.com/steal', next.replace('&page=2', '')]) {
        await expect(generateNotes({ fetchImpl: async () => response([], 200, `<${link}>; rel="next"`) }, context([commit(1)]))).rejects.toThrow(/pagination/i);
    }
    for (const request of [async () => response({ secret: 'secret' }, 403), async () => { throw new Error('secret'); }, async () => response({})]) {
        await expect(generateNotes({ fetchImpl: request }, context([commit(1)]))).rejects.toThrow(/GitHub/);
        try { await generateNotes({ fetchImpl: request }, context([commit(1)])); } catch (error) { expect(error.message).not.toContain('secret'); }
    }
});

test('rejects invalid repository configuration and missing credentials', async () => {
    await expect(generateNotes({}, { ...context([commit(1)]), options: { repositoryUrl: 'https://example.com/repo' } })).rejects.toThrow(/repository URL/);
    await expect(generateNotes({}, { ...context([commit(1)]), env: {} })).rejects.toThrow(/GITHUB_TOKEN/);
});

test('semantic-release loads the one-file plugin without changing version analysis', () => {
    const root = path.join(__dirname, '..');
    const normalize = pathToFileURL(path.join(root, 'node_modules/semantic-release/lib/plugins/normalize.js')).href;
    const script = `import normalize from ${JSON.stringify(normalize)};
        import {analyzeCommits} from '@semantic-release/commit-analyzer';
        const logger={log(){},success(){},warn(){},error(){},scope(){return this;}};
        const context={cwd:process.cwd(),options:{},logger};
        const hook=await normalize(context,'generateNotes','./scripts/release-notes.js',{});
        if(typeof hook!=='function')throw new Error('Plugin did not load');
        const actual=[];
        for(const message of ['fix: repair','feat: add','chore: update\\n\\nbreaking change: Upgrade.','perf: faster'])
            actual.push(await analyzeCommits({}, {...context,commits:[{message,hash:'a'.repeat(40)}]}));
        process.stdout.write(JSON.stringify(actual));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(['patch', 'minor', 'major', 'patch']);
    const config = require('../.releaserc.json');
    expect(config.plugins[0]).toBe('@semantic-release/commit-analyzer');
    expect(config.plugins[1]).toBe('./scripts/release-notes.js');
    expect(config.plugins).toContain('@semantic-release/changelog');
    expect(config.plugins).toContain('@semantic-release/github');
});

test('the existing changelog and GitHub stages receive the same authored notes', () => {
    const fs = require('node:fs'), os = require('node:os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-notes-stage-'));
    try {
        const root = path.join(__dirname, '..');
        const prepare = pathToFileURL(path.join(root, 'node_modules/@semantic-release/changelog/lib/prepare.js')).href;
        const publish = pathToFileURL(path.join(root, 'node_modules/@semantic-release/github/lib/publish.js')).href;
        const notes = '# v4.9.0\n\n### Changes\n\n- Celebrate donations.\n';
        const script = `import prepare from ${JSON.stringify(prepare)}; import publish from ${JSON.stringify(publish)};
            import fs from 'node:fs/promises';
            const notes=${JSON.stringify(notes)};
            const context={cwd:${JSON.stringify(dir)},options:{repositoryUrl:${JSON.stringify(url)}},env:{GITHUB_TOKEN:'test'},
                branch:{name:'main',type:'release'},logger:{log(){}},nextRelease:{gitTag:'v4.9.0',version:'4.9.0',notes}};
            await prepare({},context);
            let body;
            class StubOctokit{async request(route,release){if(route!=='POST /repos/{owner}/{repo}/releases')throw new Error('Unexpected publication');
                body=release.body; return {data:{html_url:'https://example.invalid/release',id:1}};}}
            await publish({},context,{Octokit:StubOctokit});
            process.stdout.write(JSON.stringify({body,changelog:await fs.readFile(context.cwd+'/CHANGELOG.md','utf8')}));`;
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, encoding: 'utf8' });
        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual({ body: notes, changelog: notes });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
