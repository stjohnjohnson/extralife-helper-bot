const { spawnSync } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const original = require('./fixtures/pr97-release-metadata.json');
const root = path.join(__dirname, '..');
const script = path.join(root, 'scripts/check-pr-description.js');
const metadata = (extra = {}) => ({ number: 100, title: 'fix: restore donations', user: { login: 'author', type: 'User' },
    body: '## Release notes\n- Donations appear correctly.\n## Upgrade actions\nNone.', ...extra });
function check(pr, { raw, env = {}, live = false, liveResponse = pr, liveStatus = 200, liveError = false } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-description-'));
    const eventPath = path.join(dir, 'event.json');
    try {
        fs.writeFileSync(eventPath, raw === undefined ? JSON.stringify({ action: 'edited', pull_request: pr, repository: { owner: { login: 'stjohnjohnson' }, name: 'extralife-helper-bot' } }) : raw);
        const preload = path.join(dir, 'fetch.cjs');
        if (live) fs.writeFileSync(preload, `globalThis.fetch=async(url, options)=>{
            if(url!==${JSON.stringify('https://api.github.com/repos/stjohnjohnson/extralife-helper-bot/pulls/' + pr?.number)} || options.redirect!=='error')throw new Error('Wrong API request');
            if(${JSON.stringify(liveError)})throw new Error('secret request details');
            return new Response(JSON.stringify(${JSON.stringify(liveResponse)}), {status:${liveStatus}});
        };`);
        const args = live ? ['--require', preload, script, '--live'] : [script];
        return spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8',
            env: { ...process.env, GITHUB_EVENT_PATH: eventPath, ...(live ? { GITHUB_TOKEN: 'test-read-only-token' } : {}), ...env } });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('catches the actual PR #97 paragraph before release and identifies its source line', () => {
    const result = check(original);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/PR #97: complete Upgrade actions.*line 24/);
    expect(result.stderr).toMatch(/bullets.*numbered steps/);
    expect(result.stderr).toMatch(/^::error title=PR release metadata::/);
});

test('accepts corrected PR #97 without dropping instructions or limitations', () => {
    const body = original.body.replace('A stopped companion cannot update its indicator. Native graphical placement still requires an operator check.',
        '- A stopped companion cannot update its indicator.\n- Native graphical placement still requires an operator check.');
    const result = check({ ...original, body });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(/1 release note.*8 upgrade entries/);
});

test.each(['.', ')'])('accepts numbered upgrade steps with %s and indented continuations', marker => {
    const result = check(metadata({ body: `## Release notes\n- Donations appear correctly.\n## Upgrade actions\n1${marker} Import the ZIP.\n   Restore settings.\n2${marker} Reconnect.\n- Offline indicators cannot update.` }));
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/3 upgrade entries/);
});

test.each(['chore: update CI', 'fix: repair CI'])('accepts internal metadata for %s', title => {
    expect(check(metadata({ title, body: '## Release notes\nInternal only.\n## Upgrade actions\nNone.' })).status).toBe(0);
});

test.each(['feat: new feature', 'feat(ui): new feature', 'chore!: change protocol'])('rejects internal notes for %s', title => {
    const result = check(metadata({ title, body: '## Release notes\nInternal only.\n## Upgrade actions\nNone.' }));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/features and breaking changes require release notes/);
});

test.each(['BREAKING CHANGE: Reimport.', 'breaking change: Reimport.', '  BREAKING CHANGE: Reimport.', '* Breaking Change: Reimport.'])('requires user-visible notes for the parsed breaking footer: %s', footer => {
    const result = check(metadata({ title: 'chore: change protocol',
        body: `## Release notes\nInternal only.\n## Upgrade actions\nNone.\n\n${footer}` }));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/breaking changes require release notes/);
});

test('requires a breaking footer for a breaking PR title', () => {
    const result = check(metadata({ title: 'fix!: change protocol' }));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/BREAKING CHANGE: footer/);
});

test('retains the authenticated non-breaking Dependabot exception', () => {
    const bot = metadata({ title: 'chore(deps): update library', body: null, user: { login: 'dependabot[bot]', type: 'Bot' } });
    expect(check(bot).status).toBe(0);
    const impersonator = check({ ...bot, user: { ...bot.user, type: 'User' } });
    expect(impersonator.status).toBe(1);
    expect(impersonator.stderr).toMatch(/Release notes/);
});

test.each(['', '- TODO', '- TBD', '- [Describe the change]', '1. Donations appear correctly.'])('rejects incomplete release notes: %s', notes => {
    const result = check(metadata({ body: `## Release notes\n${notes}\n## Upgrade actions\nNone.` }));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/complete Release notes/);
});

test('empty template comments fail rather than count as completed fields', () => {
    const result = check(metadata({ body: fs.readFileSync(path.join(root, '.github/pull_request_template.md'), 'utf8') }));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/complete Release notes/);
});

test.each(['#100', '#0', '#12, #12', '12'])('rejects invalid replacement references: %s', refs => {
    const result = check(metadata({ body: metadata().body + `\n<!-- replaces-release-notes: ${refs} -->` }));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/replacement/);
});

test('accepts a well-formed replacement marker for release-time target verification', () => {
    expect(check(metadata({ body: metadata().body + '\n<!-- replaces-release-notes: #12, #13 -->' })).status).toBe(0);
});

test('escapes untrusted text so metadata cannot introduce workflow annotations', () => {
    const result = check(metadata({ body: '## Release notes\n- Valid.\n## Upgrade actions\nInvalid 100% text\r::warning::injected' }));
    expect(result.status).toBe(1);
    expect(result.stderr.split('\n').filter(line => line.startsWith('::'))).toHaveLength(1);
    expect(result.stderr).toContain('100%25');
    expect(result.stderr).toContain('%0D::warning::injected');
});

test.each(['not json', '{}', '{"pull_request":{"number":"100"}}'])('fails safely for malformed event metadata: %s', raw => {
    const result = check(undefined, { raw });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/pull request event/i);
    expect(result.stderr).not.toMatch(/SyntaxError|at Object/);
});

test('supports a local JSON path and fails clearly when the event file is absent', () => {
    const missing = path.join(os.tmpdir(), 'missing-pr-description-event-100.json');
    const result = spawnSync(process.execPath, [script, missing], { cwd: root, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_PATH: '' } });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/read pull request event/);
});


test('a historical rerun checks the current invalid description rather than the old passing snapshot', () => {
    const snapshot = metadata();
    const current = { ...snapshot, body: '## Release notes\n- Valid.\n## Upgrade actions\nStandalone limitation.' };
    const result = check(snapshot, { live: true, liveResponse: current });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/complete Upgrade actions/);
});

test('hosted checks accept the current corrected description even if the event snapshot is invalid', () => {
    const result = check(metadata({ body: '' }), { live: true, liveResponse: metadata() });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/release metadata is valid/);
});

test.each([403, 404, 500])('live metadata lookup fails closed on HTTP %s', liveStatus => {
    const result = check(metadata(), { live: true, liveStatus });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/current PR metadata request failed/);
    expect(result.stderr).not.toContain('test-read-only-token');
});

test('live metadata lookup fails safely on transport errors', () => {
    const result = check(metadata(), { live: true, liveError: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/current PR metadata request failed/);
    expect(result.stderr).not.toContain('secret request details');
});

test('live mode requires a read-only token', () => {
    const result = check(metadata(), { live: true, env: { GITHUB_TOKEN: '', GH_TOKEN: '' } });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/GITHUB_TOKEN or GH_TOKEN/);
});

test('live mode rejects missing repository context and malformed API metadata', () => {
    const missing = check(metadata(), { live: true, raw: JSON.stringify({ pull_request: metadata() }) });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/repository metadata/);
    const malformed = check(metadata(), { live: true, liveResponse: { number: 100 } });
    expect(malformed.status).toBe(1);
    expect(malformed.stderr).toMatch(/pull request event/);
});
