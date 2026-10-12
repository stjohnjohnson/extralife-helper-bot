// Match the unchanged Angular analyzer's note prefixes (case, whitespace and
// list markers), including the conventional hyphen spelling conservatively.
const BREAKING_PREFIX = /^[\s|*]*(BREAKING(?: CHANGE|-CHANGE))[:\s]+(.*)/i;
const REVERT = /^(?:Revert|revert:)\s"?([\s\S]+?)"?\s*This reverts commit (\w{7,40})\b/i;

function breakingNotes(message) {
    const notes = [];
    let current;
    for (const line of message.split(/\r?\n/)) {
        const start = line.match(BREAKING_PREFIX);
        if (start) {
            current = [];
            notes.push(current);
            if (start[2]) current.push(start[2]);
        } else if (current && /^(?:[A-Za-z][A-Za-z -]+: |(?:Closes|Fixes|Refs) #\d|## )/i.test(line)) {
            current = undefined;
        } else if (current && line.trim()) {
            current.push(line.trim());
        }
    }
    return notes.map(note => note.join(' ')).filter(Boolean);
}

function isReleaseRelevant(message) {
    return /^(?:feat|fix|perf)(?:\([^()]+\))?!?:/.test(message) ||
        REVERT.test(message) || breakingNotes(message).length > 0;
}

module.exports = { breakingNotes, isReleaseRelevant };
