const { parsePrDescription, validatePrDescription, isDependabotMaintenance } = require('./contract');
const { repositoryIdentity } = require('./github');

function breakingNotes(message) {
    const notes = [];
    let current;
    for (const line of message.split(/\r?\n/)) {
        const start = line.match(/^BREAKING(?: CHANGE|-CHANGE):\s*(.*)$/);
        if (start) {
            current = [];
            notes.push(current);
            if (start[1]) current.push(start[1]);
        } else if (current && /^(?:[A-Za-z][A-Za-z -]+: |(?:Closes|Fixes|Refs) #\d|## )/.test(line)) {
            current = undefined;
        } else if (current && line.trim()) {
            current.push(line.trim());
        }
    }
    return notes.map(note => note.join(' ')).filter(Boolean);
}

function renderReleaseNotes({ prs, commits, repositoryUrl, lastRelease = {}, nextRelease = {} }) {
    const identity = repositoryIdentity(repositoryUrl);
    const sorted = [...prs].sort((a, b) => (a.candidate ? '9999' : a.mergedAt).localeCompare(b.candidate ? '9999' : b.mergedAt) || a.number - b.number);
    const parsed = new Map();
    const byNumber = new Map();
    for (const pr of sorted) {
        const checked = validatePrDescription(pr);
        if (checked.errors.length) throw new Error(`PR #${pr.number}: ${checked.errors.join(' ')}`);
        if (!Number.isSafeInteger(pr.number) || pr.number <= 0 || byNumber.has(pr.number)) throw new Error('Invalid or duplicate release PR number.');
        if (pr.htmlUrl !== `${identity.repositoryUrl}/pull/${pr.number}`) throw new Error(`Invalid release PR URL for #${pr.number}.`);
        if (pr.base !== 'main' || (!pr.candidate && !Number.isFinite(Date.parse(pr.mergedAt)))) throw new Error(`PR #${pr.number} is not a merged main PR.`);
        const data = isDependabotMaintenance(pr) ? { internalOnly: true, releaseNotes: [], upgradeActions: [], replaces: [] } : parsePrDescription(pr.body);
        if (data.internalOnly && commits.some(commit => pr.commitHashes?.includes(commit.hash) && breakingNotes(commit.message).length)) {
            throw new Error(`PR #${pr.number}: breaking changes require release notes.`);
        }
        parsed.set(pr.number, data);
        byNumber.set(pr.number, pr);
    }
    const replaced = new Set();
    for (const pr of sorted) {
        const data = parsed.get(pr.number);
        for (const number of data.replaces) {
            const target = byNumber.get(number);
            if (!target || sorted.indexOf(target) >= sorted.indexOf(pr) || parsed.get(number).internalOnly) {
                throw new Error(`PR #${pr.number}: replacement #${number} must refer to an earlier user-facing PR in this release.`);
            }
            if (parsed.get(number).upgradeActions.length && !data.upgradeActions.length) {
                throw new Error(`PR #${pr.number}: review and restate applicable upgrade actions from #${number}.`);
            }
            replaced.add(number);
        }
    }
    for (const commit of commits) {
        if (/^(?:feat|fix)(?:\([^()]+\))?!?:/.test(commit.message) || breakingNotes(commit.message).length) {
            if (!sorted.some(pr => pr.mergeCommitSha === commit.hash || pr.commitHashes?.includes(commit.hash))) {
                throw new Error(`Release commit ${commit.hash.slice(0, 7)} is not associated with a merged PR. Supply reviewed PR release notes before publishing.`);
            }
        }
    }
    const active = sorted.filter(pr => !replaced.has(pr.number) && !parsed.get(pr.number).internalOnly);
    const lines = [nextRelease.version ? `# v${nextRelease.version}` : '# Release preview', ''];
    if (lastRelease.gitTag && nextRelease.gitTag) {
        lines.push(`[Full changelog](${identity.repositoryUrl}/compare/${encodeURIComponent(lastRelease.gitTag)}...${encodeURIComponent(nextRelease.gitTag)})`, '');
    }
    const breaking = [...new Set(commits.flatMap(commit => breakingNotes(commit.message)))];
    if (breaking.length) lines.push('### Breaking changes', '', ...breaking.map(note => `- ${note}`), '');
    if (active.length) {
        lines.push('### Changes', '');
        for (const pr of active) {
            lines.push(...parsed.get(pr.number).releaseNotes.map(note => `- ${note} ([#${pr.number}](${pr.htmlUrl}))`));
        }
    } else {
        lines.push('Internal maintenance; no user-facing changes.');
    }
    const upgrades = active.flatMap(pr => parsed.get(pr.number).upgradeActions.map(note => `- ${note} ([#${pr.number}](${pr.htmlUrl}))`));
    if (upgrades.length) lines.push('', '### Upgrade actions', '', ...upgrades);
    return lines.join('\n').trim() + '\n';
}

module.exports = { renderReleaseNotes };
