// Shared by PR checks and release generation. GitHub lookup and release-wide
// replacement checks remain in the release generator.
function section(body, name) {
    let heading, fence, startLine;
    const rows = [];
    // Retain line breaks in comments so diagnostics refer to the original body.
    const lines = (body || '').replace(/<!--[\s\S]*?-->/g, comment => comment.replace(/[^\r\n]/g, '')).split(/\r?\n/);
    for (const [index, text] of lines.entries()) {
        const marker = text.match(/^\s{0,3}(`{3,}|~{3,})/);
        if (marker) {
            if (!fence) fence = marker[1];
            else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
        } else if (!fence && /^## /.test(text)) {
            heading = text.slice(3).trim();
            if (heading === name) startLine = index + 1;
            continue;
        }
        if (heading === name) rows.push({ text, line: index + 1 });
    }
    return { rows, startLine, text: rows.map(row => row.text).join('\n').trim() };
}

function incomplete(pr, field, row, startLine) {
    const location = row ? ` At line ${row.line}: ${row.text}` : startLine ? ` At line ${startLine}.` : ` Add the ## ${field} heading.`;
    const format = field === 'Upgrade actions'
        ? 'Use bullets or numbered steps; put separate limitations in bullets. Use exactly None. when no action is needed.'
        : 'Use bullets for shipped behavior, or exactly Internal only. for maintenance. Replace empty fields and placeholders.';
    return new Error(`PR #${pr.number}: complete ${field} in the PR template.${location} ${format}`);
}

function bullets(input, pr, field) {
    const rows = input.rows.filter(row => row.text.trim());
    const result = [];
    for (const [index, row] of rows.entries()) {
        // Match the original section-level trim behavior at its boundaries.
        let text = index === 0 ? row.text.trimStart() : row.text;
        if (index === rows.length - 1) text = text.trimEnd();
        const item = text.match(field === 'Upgrade actions' ? /^(?:[-*]|\d{1,9}[.)]) (\S.*)$/ : /^[-*] (\S.*)$/);
        if (item) result.push({ text: item[1], row });
        else if (/^\s+\S/.test(text) && result.length) result[result.length - 1].text += ' ' + text.trim();
        else throw incomplete(pr, field, row, input.startLine);
    }
    const placeholder = result.find(item => /^(?:TODO|TBD)$/i.test(item.text) || /\[(?:Describe|Insert|Replace)\b/i.test(item.text));
    if (!result.length || placeholder) throw incomplete(pr, field, placeholder?.row, input.startLine);
    return result.map(item => item.text);
}

function parseReleaseMetadata(pr, { breaking = false } = {}) {
    const titledBreaking = /!:\s/.test(pr.title);
    // Match the configured Angular parser's note prefixes and case handling.
    const footer = /^[\s|*]*BREAKING CHANGE[:\s]+/im.test(pr.body || '');
    breaking = breaking || titledBreaking || footer;
    const bot = pr.user?.login === 'dependabot[bot]' && pr.user.type === 'Bot' && /^chore\(deps(?:-[a-z]+)?\): /.test(pr.title) && !breaking;
    const notes = section(pr.body, 'Release notes');
    const upgrades = section(pr.body, 'Upgrade actions');
    const internal = bot || notes.text === 'Internal only.';
    if (internal && (breaking || /^feat(?:\([^()]+\))?!?:/.test(pr.title))) {
        throw new Error(`PR #${pr.number}: features and breaking changes require release notes.`);
    }
    const record = { internal, notes: internal ? [] : bullets(notes, pr, 'Release notes'),
        upgrades: bot || upgrades.text === 'None.' ? [] : bullets(upgrades, pr, 'Upgrade actions'), replacements: [] };
    if (titledBreaking && !footer) throw new Error(`PR #${pr.number}: add a BREAKING CHANGE: footer for the breaking PR title.`);
    const refs = pr.body?.match(/<!--\s*replaces-release-notes:\s*([\s\S]*?)-->/)?.[1];
    if (refs !== undefined) {
        const references = refs.trim().split(/\s*,\s*/);
        if (internal || new Set(references).size !== references.length || references.some(ref => !/^#[1-9]\d*$/.test(ref) || Number(ref.slice(1)) === pr.number)) {
            throw new Error(`PR #${pr.number}: invalid release-note replacement. Use distinct earlier PR numbers, such as #12, #13.`);
        }
        record.replacements = references.map(ref => Number(ref.slice(1)));
    }
    return record;
}

module.exports = { parseReleaseMetadata };
