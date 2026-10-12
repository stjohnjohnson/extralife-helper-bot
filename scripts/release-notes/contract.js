const SECTIONS = ['Summary', 'Release notes', 'Upgrade actions', 'Validation'];
const TITLE = /^(feat|fix|docs|style|refactor|test|chore)(?:\([^()\r\n]+\))?(!)?: \S[^\r\n]*$/;

function isDependabotMaintenance({ title, author, body = '' }) {
    return author?.type === 'Bot' && author.login === 'dependabot[bot]' &&
        /^chore\(deps(?:-[a-z]+)?\): /.test(title || '') && !/^BREAKING(?: CHANGE|-CHANGE):/m.test(body);
}

function visibleText(body) {
    return body.replace(/<!--[\s\S]*?-->/g, '').trim();
}

function readSections(body) {
    const sections = new Map();
    let current;
    let fence;
    for (const line of visibleText(body).split(/\r?\n/)) {
        const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
        if (marker) {
            if (!fence) {
                fence = marker[1];
            } else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) {
                fence = undefined;
            }
            // Code examples belong to their section, but cannot introduce sections.
        } else if (!fence) {
            const heading = line.match(/^## (.+?)\s*$/);
            if (heading) {
                current = heading[1];
                if (sections.has(current)) {
                    throw new Error(`Duplicate section: ${current}.`);
                }
                sections.set(current, []);
                continue;
            }
        }
        if (current) {
            sections.get(current).push(line);
        }
    }
    for (const name of SECTIONS) {
        if (!sections.has(name) || !sections.get(name).join('\n').trim()) {
            throw new Error(`Complete the ${name} section.`);
        }
    }
    return sections;
}

function bulletList(text, name) {
    const bullets = [];
    for (const line of text.trim().split(/\r?\n/)) {
        if (!line.trim()) {
            continue;
        }
        const bullet = line.match(/^[-*] (\S.*)$/);
        if (bullet) {
            bullets.push(bullet[1].trim());
        } else if (/^\s+\S/.test(line) && bullets.length) {
            bullets[bullets.length - 1] += ` ${line.trim()}`;
        } else {
            throw new Error(`Use bullets in ${name}.`);
        }
    }
    return bullets;
}

function parsePrDescription(body) {
    if (typeof body !== 'string') {
        throw new Error('Complete the PR description.');
    }
    const text = visibleText(body);
    if (/(?:^|\n)\s*(?:[-*] )?(?:TODO|TBD)\s*(?:\n|$)|\[(?:Describe|Insert|Replace)\b[^\]]*\]|#NUMBER\b/i.test(text)) {
        throw new Error('Replace template placeholders in the PR description.');
    }
    const sections = readSections(body);
    const releaseText = sections.get('Release notes').join('\n').trim();
    const upgradeText = sections.get('Upgrade actions').join('\n').trim();
    const internalOnly = releaseText === 'Internal only.';
    const releaseNotes = internalOnly ? [] : bulletList(releaseText, 'Release notes');
    if (!internalOnly && (releaseNotes.length < 1 || releaseNotes.length > 3)) {
        throw new Error('Write one to three release-note bullets.');
    }
    const upgradeActions = upgradeText === 'None.' ? [] : bulletList(upgradeText, 'Upgrade actions');
    const declarations = [...body.matchAll(/<!--\s*replaces-release-notes:\s*([\s\S]*?)-->/g)];
    if (declarations.length > 1) {
        throw new Error('Use one replaces-release-notes comment.');
    }
    const replaces = declarations.length ? declarations[0][1].trim().split(/\s*,\s*/).map(value => {
        if (!/^#[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value.slice(1)))) {
            throw new Error('Replacement references must be positive PR numbers, such as #71.');
        }
        return Number(value.slice(1));
    }) : [];
    if (new Set(replaces).size !== replaces.length) {
        throw new Error('Do not repeat replacement references.');
    }
    if (internalOnly && replaces.length) {
        throw new Error('Internal maintenance cannot replace user-facing release notes.');
    }
    return { releaseNotes, upgradeActions, internalOnly, replaces };
}

function validatePrDescription(pr) {
    const errors = [];
    const warnings = [];
    const title = pr.title || '';
    const titleMatch = title.match(TITLE);
    if (!titleMatch) {
        errors.push('Use a Conventional Commit PR title: type(optional-scope): description.');
    }
    if (isDependabotMaintenance(pr)) {
        return { errors, warnings };
    }
    if (titleMatch?.[2] && !/^BREAKING CHANGE:\s*\S/m.test(pr.body || '')) {
        errors.push('Breaking PR titles require a BREAKING CHANGE: footer for version analysis.');
    }
    try {
        const parsed = parsePrDescription(pr.body);
        if (parsed.internalOnly && (titleMatch?.[1] === 'feat' || titleMatch?.[2] || /^BREAKING(?: CHANGE|-CHANGE):/m.test(pr.body))) {
            errors.push('Features and breaking changes require user-facing release notes.');
        }
        const count = visibleText(pr.body).split(/\s+/).length;
        if (count > 250) {
            warnings.push('The PR exceeds 250 words; link detailed evidence unless the extra detail is needed.');
        }
        if (parsed.releaseNotes.some(note => note.split(/\s+/).length > 30)) {
            warnings.push('Aim for roughly 30 words per release-note bullet.');
        }
    } catch (error) {
        errors.push(error.message);
    }
    return { errors, warnings };
}

module.exports = { parsePrDescription, validatePrDescription, isDependabotMaintenance };
