const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const { parsePrDescription, validatePrDescription } = require('../scripts/release-notes/contract');

function body(notes = '- Show hearts when a donation arrives.', upgrades = 'None.') {
    return `## Summary\nDonations lacked a shared celebration. Closes #81.\n\n## Release notes\n${notes}\n\n## Upgrade actions\n${upgrades}\n\n## Validation\n- npm test — passed.\n`;
}

describe('PR release-note contract', () => {
    test('extracts completed template sections and strips authoring comments', () => {
        expect(parsePrDescription(body('- Show hearts.\n- Celebrate milestones.', '- Reimport the companion.'))).toEqual({
            releaseNotes: ['Show hearts.', 'Celebrate milestones.'],
            upgradeActions: ['Reimport the companion.'], internalOnly: false, replaces: []
        });
        expect(validatePrDescription({ title: 'feat: celebrate donations', body: body(), author: {} }).errors).toEqual([]);
        expect(validatePrDescription({ title: 'fix: keep donation captions visible', body: body(), author: {} }).errors).toEqual([]);
    });

    test('internal maintenance has an explicit sentinel, not an empty release note', () => {
        expect(parsePrDescription(body('Internal only.')).internalOnly).toBe(true);
        expect(validatePrDescription({ title: 'chore: install CI prerequisites', body: body('Internal only.') }).errors).toEqual([]);
    });

    test.each(['feat: celebrations', 'feat!: new protocol', 'fix!: change protocol'])('rejects internal-only features/breaking changes: %s', title => {
        expect(validatePrDescription({ title, body: body('Internal only.') }).errors).not.toEqual([]);
    });

    test('a breaking-change footer also prevents internal-only classification', () => {
        expect(validatePrDescription({ title: 'fix: change protocol', body: body('Internal only.') + '\nBREAKING CHANGE: Reimport the companion.' }).errors).not.toEqual([]);
    });

    test('breaking PR titles require the footer used by the existing version analyzer', () => {
        expect(validatePrDescription({ title: 'feat!: replace protocol', body: body() }).errors).not.toEqual([]);
        expect(validatePrDescription({ title: 'feat!: replace protocol', body: body() + '\nBREAKING CHANGE: Reimport the companion.' }).errors).toEqual([]);
    });

    test.each([
        ['', 'empty body'],
        [body().replace('## Validation', '## Evidence'), 'missing section'],
        [body().replace('## Release notes', '## Release notes\n\n## Release notes'), 'duplicate section'],
        [body(''), 'empty notes'],
        [body('None.'), 'not a release note'],
        [body('- TODO'), 'placeholder'],
        [body('- [Describe shipped behavior]'), 'placeholder'],
        [body('- A\n- B\n- C\n- D'), 'too many release bullets'],
        [body('- Shipped behavior.', ''), 'empty upgrade actions']
    ])('rejects malformed descriptions: %s (%s)', description => {
        expect(validatePrDescription({ title: 'feat: ship behavior', body: description }).errors.length).toBeGreaterThan(0);
    });

    test('ignores headings inside fenced examples and HTML comments', () => {
        const description = body() + '\n```markdown\n## Release notes\n```\n<!-- ## Release notes -->';
        expect(validatePrDescription({ title: 'feat: ship behavior', body: description }).errors).toEqual([]);
        const template = fs.readFileSync(path.join(__dirname, '../.github/pull_request_template.md'), 'utf8');
        expect(validatePrDescription({ title: 'feat: ship behavior', body: template }).errors.length).toBeGreaterThan(0);
    });

    test('parses explicit supersession metadata, including multiple PRs', () => {
        expect(parsePrDescription(body() + '\n<!-- replaces-release-notes: #71, #72 -->').replaces).toEqual([71, 72]);
    });

    test.each(['0', '#0', '#71, invalid', '#71, #71', '#9007199254740992'])('rejects invalid supersession: %s', references => {
        expect(validatePrDescription({ title: 'feat: ship behavior', body: body() + `\n<!-- replaces-release-notes: ${references} -->` }).errors.length).toBeGreaterThan(0);
    });

    test('only authenticated non-breaking Dependabot chores may omit the template', () => {
        expect(validatePrDescription({ title: 'chore(deps-dev): update dependencies', body: '', author: { login: 'dependabot[bot]', type: 'Bot' } }).errors).toEqual([]);
        for (const candidate of [
            { title: 'chore(deps): update dependencies', author: { login: 'dependabot[bot]', type: 'User' } },
            { title: 'fix(deps): security update', author: { login: 'dependabot[bot]', type: 'Bot' } },
            { title: 'chore(deps)!: upgrade dependencies', author: { login: 'dependabot[bot]', type: 'Bot' } },
            { title: 'chore: improve CI', author: { login: 'other[bot]', type: 'Bot' } }
        ]) {
            expect(validatePrDescription({ ...candidate, body: '' }).errors.length).toBeGreaterThan(0);
        }
    });

    test('word-count guidance warns without rejecting justified detail', () => {
        expect(validatePrDescription({ title: 'feat: ship behavior', body: body().replace('Donations lacked a shared celebration.', 'Details '.repeat(300)) })).toEqual({ errors: [], warnings: expect.any(Array) });
        expect(validatePrDescription({ title: 'feat: ship behavior', body: body().replace('Donations lacked a shared celebration.', 'Details '.repeat(300)) }).warnings.length).toBeGreaterThan(0);
    });

    test('CLI reads event JSON safely and fails incomplete descriptions', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-description-'));
        try {
            const file = path.join(dir, 'event with spaces.json');
            const run = description => {
                fs.writeFileSync(file, JSON.stringify({ pull_request: { title: 'feat: ship behavior', body: description, user: { login: 'author', type: 'User' } } }));
                return spawnSync(process.execPath, [path.join(__dirname, '../scripts/check-pr-description.js'), '--event', file], { encoding: 'utf8' });
            };
            const valid = run(body('- Display literal `$(touch SHOULD_NOT_EXIST)` text.'));
            expect(valid.status).toBe(0);
            expect(fs.existsSync(path.join(process.cwd(), 'SHOULD_NOT_EXIST'))).toBe(false);
            const invalid = run('');
            expect(invalid.status).toBe(1);
            expect(invalid.stderr).toContain('PR description');
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
