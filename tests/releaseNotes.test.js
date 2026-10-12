const { spawnSync } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const writerOptions = require('../scripts/release-notes');
const url = 'https://github.com/stjohnjohnson/extralife-helper-bot';
const sha = n => String(n).padStart(40, '0');
const pr = (number, notes, upgrades = 'None.', extra = {}) => ({ number, title: 'feat: celebrate donations',
    body: `## Summary\nFinal behavior.\n## Release notes\n${notes}\n## Upgrade actions\n${upgrades}\n## Validation\n- Tests passed.`,
    merged_at: `2026-10-12T12:${String(number).padStart(2, '0')}:00Z`, merge_commit_sha: sha(number), base: { ref: 'main' },
    user: { type: 'User', login: 'author' }, ...extra });
// These are the generator's parsed-commit boundary fields, not a second parser.
const commit = (n, extra = {}) => ({ hash: sha(n), message: 'feat: celebrate donations', type: 'feat', notes: [], ...extra });
const response = (data, status = 200, link = '') => new Response(JSON.stringify(data), { status, headers: { link } });
const context = { host: 'https://github.com', owner: 'stjohnjohnson', repository: 'extralife-helper-bot', version: '4.9.0' };
const finalize = async (prs, commits = prs.map(p => commit(p.number, { message: p.title, type: p.title.split(':')[0].split('(')[0] })), extra = {}) => {
    const options = writerOptions({ token: 'secret', fetchImpl: async () => response(prs), ...extra });
    return options.finalizeContext(context, options, [], null, commits.filter(item => !options.skip(item)));
};

test('deduplicates final PR notes, retaining upgrades without intermediate or CI claims', async () => {
    const old = pr(1, '- Add broadcast sessions and rehearsal.', '- Import the companion.');
    const current = pr(2, '- Connect Stream Avatars for donation and campaign celebrations.', '- Reimport and restore private settings.');
    current.body += '\n<!-- replaces-release-notes: #1 -->';
    const internal = pr(3, 'Internal only.', 'None.', { title: 'fix: restore CI' });
    const result = await finalize([internal, current, old], [commit(1), commit(2), commit(3, { type: 'fix' }), commit(4)]);
    expect(result.releaseNotes).toEqual([{ text: 'Connect Stream Avatars for donation and campaign celebrations.', number: 2, url: url + '/pull/2' }]);
    expect(result.upgradeActions).toEqual([{ text: 'Reimport and restore private settings.', number: 2, url: url + '/pull/2' }]);
});

test.each(['.', ')'])('accepts numbered upgrade steps with %s markers in authored order', async marker => {
    const upgrades = `1${marker} Run npm run sa:package.\n2${marker} Import the companion ZIP.\n   Restore the private connection settings.\n3${marker} Remove obsolete theme variables.`;
    const result = await finalize([pr(1, '- Add game-themed scenery.', upgrades)]);
    expect(result.upgradeActions).toEqual([
        { text: 'Run npm run sa:package.', number: 1, url: url + '/pull/1' },
        { text: 'Import the companion ZIP. Restore the private connection settings.', number: 1, url: url + '/pull/1' },
        { text: 'Remove obsolete theme variables.', number: 1, url: url + '/pull/1' }
    ]);
});

test.each(['Run the package command.', '1. TODO', '1. TBD', '1. [Insert upgrade instructions]', '1. '])(
    'rejects invalid upgrade instructions: %s', upgrades => {
        return expect(finalize([pr(1, '- Add game-themed scenery.', upgrades)])).rejects.toThrow(/PR #1: complete Upgrade actions/);
    });

test('keeps release notes restricted to bullet lists', () => {
    return expect(finalize([pr(1, '1. Add game-themed scenery.')])).rejects.toThrow(/PR #1: complete Release notes/);
});

test('limits inputs to merged main PRs in this release', async () => {
    const result = await finalize([pr(2, '- Celebrate donations.'), pr(1, '- Old.'), pr(3, '- Unmerged.', 'None.', { merged_at: null }),
        pr(4, '- Other branch.', 'None.', { base: { ref: 'other' } })], [commit(2)]);
    expect(result.releaseNotes.map(note => note.text)).toEqual(['Celebrate donations.']);
});

test('keeps authenticated Dependabot maintenance internal', async () => {
    const bot = pr(1, '', 'None.', { title: 'chore(deps): update libraries', body: '', user: { login: 'dependabot[bot]', type: 'Bot' } });
    expect((await finalize([bot])).releaseNotes).toEqual([]);
    await expect(finalize([{ ...bot, user: { ...bot.user, type: 'User' } }])).rejects.toThrow(/Release notes/);
});

test('retains required upgrade actions from internal maintenance PRs', async () => {
    const result = await finalize([pr(1, 'Internal only.', '- Upgrade the deployment runtime to Node.js 24.', { title: 'chore: update runtime' })]);
    expect(result.releaseNotes).toEqual([]);
    expect(result.upgradeActions).toEqual([{ text: 'Upgrade the deployment runtime to Node.js 24.', number: 1, url: url + '/pull/1' }]);
});

test.each(['', '## Release notes\n- TODO\n## Upgrade actions\nNone.', '## Release notes\n- Shipped.'])('missing release fields fail with an actionable PR number: %s', body => {
    return expect(finalize([pr(1, '', 'None.', { body })])).rejects.toThrow(/PR #1/);
});

test('comments and fenced examples cannot introduce release sections', async () => {
    const item = pr(1, '- Celebrate donations.');
    item.body = '## Summary\n```markdown\n## Release notes\n- Wrong.\n```\n<!-- ## Release notes\n- Hidden. -->\n' + item.body;
    expect((await finalize([item])).releaseNotes.map(note => note.text)).toEqual(['Celebrate donations.']);
});

test.each(['#1', '#99', '#0', '#1, #1'])('rejects self, missing or malformed replacements: %s', refs => {
    const item = pr(1, '- Celebrate donations.'); item.body += `\n<!-- replaces-release-notes: ${refs} -->`;
    return expect(finalize([item])).rejects.toThrow(/replacement/i);
});

test('replacement chains retain final upgrade actions', async () => {
    const items = [pr(1, '- Original.', '- Reimport.'), pr(2, '- Revised.', '- Reimport.'), pr(3, '- Final.', '- Reimport.')];
    items[1].body += '\n<!-- replaces-release-notes: #1 -->'; items[2].body += '\n<!-- replaces-release-notes: #2 -->';
    expect((await finalize(items)).releaseNotes.map(note => note.text)).toEqual(['Final.']);
    items[2].body = items[2].body.replace('- Reimport.', 'None.');
    await expect(finalize(items)).rejects.toThrow(/upgrade/i);
});

test('uses the generator parsed metadata to prevent internal breaking changes', async () => {
    const commits = [commit(1, { type: 'chore', notes: [{ title: 'BREAKING CHANGE', text: 'Reimport.' }] })];
    await expect(finalize([pr(1, 'Internal only.', 'None.', { title: 'chore: update protocol' })], commits)).rejects.toThrow(/breaking/i);
    await expect(finalize([pr(1, 'Internal only.')])).rejects.toThrow(/release notes/i);
    const bot = pr(1, '', 'None.', { title: 'chore(deps): update libraries', body: '', user: { login: 'dependabot[bot]', type: 'Bot' } });
    await expect(finalize([bot], commits)).rejects.toThrow(/Release notes/);
});

test.each([{ type: 'perf' }, { type: 'fix' }, { type: 'revert', revert: { header: 'feat: captions', hash: 'abc1234' } },
    { type: 'chore', notes: [{ title: 'BREAKING CHANGE', text: 'Upgrade.' }] }])('requires PR notes for parsed release-relevant commits: %s', extra => {
    return expect(finalize([], [commit(1, extra)])).rejects.toThrow(/not associated/);
});

test('paginates metadata and fails safely on foreign URLs, cycles and API errors', async () => {
    const next = `https://api.github.com/repos/stjohnjohnson/extralife-helper-bot/commits/${sha(1)}/pulls?per_page=100&page=2`;
    const fetchImpl = jest.fn().mockResolvedValueOnce(response([], 200, `<${next}>; rel="next"`)).mockResolvedValueOnce(response([pr(1, '- Shipped.')]));
    expect((await finalize([], [commit(1)], { fetchImpl })).releaseNotes[0].text).toBe('Shipped.');
    for (const link of ['https://example.com/steal', next.replace('&page=2', '')]) {
        await expect(finalize([], [commit(1)], { fetchImpl: async () => response([], 200, `<${link}>; rel="next"`) })).rejects.toThrow(/pagination/i);
    }
    for (const request of [async () => response({ secret: 'secret' }, 403), async () => { throw new Error('secret'); }, async () => response({})]) {
        try { await finalize([], [commit(1)], { fetchImpl: request }); throw new Error('Expected request failure'); }
        catch (error) { expect(error.message).toMatch(/GitHub/); expect(error.message).not.toContain('secret'); }
    }
});

test('validates the generator repository context and requires metadata credentials', async () => {
    const options = writerOptions({ token: '' });
    await expect(options.finalizeContext(context, options, [], null, [commit(1)])).rejects.toThrow(/GITHUB_TOKEN/);
    await expect(options.finalizeContext({ ...context, host: 'https://example.com' }, options, [], null, [])).rejects.toThrow(/repository/);
});

test('the real generator loads the configured writer, parses breaking notes and formats authored fields', () => {
    const root = path.join(__dirname, '..');
    const getConfig = pathToFileURL(path.join(root, 'node_modules/semantic-release/lib/get-config.js')).href;
    const item = pr(1, '- Use the companion.', '1. Reimport.');
    const script = `import getConfig from ${JSON.stringify(getConfig)};
        import {analyzeCommits} from '@semantic-release/commit-analyzer';
        process.env.GITHUB_TOKEN='test';
        globalThis.fetch=async()=>new Response(JSON.stringify([${JSON.stringify(item)}]));
        const logger={log(){},success(){},warn(){},error(){},scope(){return this;}};
        const {options,plugins}=await getConfig({cwd:process.cwd(),env:process.env,logger,stdout:process.stdout,stderr:process.stderr});
        const entry=options.plugins.find(p=>Array.isArray(p)&&p[0]==='@semantic-release/release-notes-generator');
        if(!entry)throw new Error('Existing generator was not retained');
        const context={cwd:process.cwd(),env:process.env,options,lastRelease:{gitTag:'v4.8.0'},
            nextRelease:{version:'4.9.0',gitTag:'v4.9.0'},logger};
        const outputs=[];
        for(const footer of ['breaking change: Reimport.','  BREAKING CHANGE: Reimport.','* Breaking Change: Reimport.']){
            const commits=[{hash:${JSON.stringify(sha(1))},message:'chore: change protocol\\n\\n'+footer+'\\nRestore settings.\\n\\nCloses #81'}];
            const version=await analyzeCommits({}, {...context,commits});
            const notes=await plugins.generateNotes({...context,commits});
            outputs.push({version,notes});
        }
        const maintenance=await plugins.generateNotes({...context,commits:[
            {hash:${JSON.stringify(sha(2))},message:'chore(release): 4.8.0 [skip ci]\\n\\nBREAKING CHANGE: Already shipped.'}]});
        const versions=[]; for(const message of ['fix: repair','feat: add','perf: faster'])
            versions.push(await analyzeCommits({}, {...context,commits:[{hash:${JSON.stringify(sha(1))},message}]}));
        process.stdout.write(JSON.stringify({outputs,maintenance,versions}));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, encoding: 'utf8' });
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    const { outputs, maintenance, versions } = JSON.parse(result.stdout);
    expect(versions).toEqual(['patch', 'minor', 'patch']);
    for (const { version, notes } of outputs) {
        expect(version).toBe('major');
        expect(notes).toContain('/compare/v4.8.0...v4.9.0');
        expect(notes).toContain('### Changes\n\n- Use the companion.');
        expect(notes).toContain('### Upgrade actions\n\n- Reimport.');
        expect(notes).toMatch(/### breaking change/i); expect(notes).toContain('Restore settings.');
        expect(notes).not.toMatch(/change protocol|Closes #81/);
    }
    expect(maintenance).toContain('Internal maintenance'); expect(maintenance).not.toContain('Already shipped.');
});

test('the existing changelog and GitHub stages consume the configured generator output', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-notes-stage-'));
    try {
        const root = path.join(__dirname, '..');
        const prepare = pathToFileURL(path.join(root, 'node_modules/@semantic-release/changelog/lib/prepare.js')).href;
        const publish = pathToFileURL(path.join(root, 'node_modules/@semantic-release/github/lib/publish.js')).href;
        const script = `import prepare from ${JSON.stringify(prepare)}; import publish from ${JSON.stringify(publish)};
            import {generateNotes} from '@semantic-release/release-notes-generator'; import fs from 'node:fs/promises';
            import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);
            const writerOpts=require('./scripts/release-notes')({token:'test',fetchImpl:async()=>new Response(JSON.stringify([${JSON.stringify(pr(1, '- Celebrate donations.'))}]))});
            const context={cwd:${JSON.stringify(dir)},options:{repositoryUrl:${JSON.stringify(url)}},env:{GITHUB_TOKEN:'test'},
                branch:{name:'main',type:'release'},logger:{log(){}},lastRelease:{gitTag:'v4.8.0'},
                nextRelease:{gitTag:'v4.9.0',version:'4.9.0'},commits:[{hash:${JSON.stringify(sha(1))},message:'feat: celebrate donations'}]};
            context.nextRelease.notes=await generateNotes({writerOpts},context);
            await prepare({},context); let body;
            class StubOctokit{async request(route,release){if(route!=='POST /repos/{owner}/{repo}/releases')throw new Error('Unexpected publication');
                body=release.body;return {data:{html_url:'https://example.invalid/release',id:1}};}}
            await publish({},context,{Octokit:StubOctokit});
            process.stdout.write(JSON.stringify({notes:context.nextRelease.notes,body,changelog:await fs.readFile(context.cwd+'/CHANGELOG.md','utf8')}));`;
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, encoding: 'utf8' });
        expect(result.status).toBe(0);
        const output = JSON.parse(result.stdout);
        expect(output.notes).toContain('Celebrate donations.');
        expect(output.body).toBe(output.notes); expect(output.changelog).toBe(output.notes);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
