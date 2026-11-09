// The same ordered alphabet is used by the portable pixel renderer.
const DONOR_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:-\'"?';
const allowed = new Set(DONOR_GLYPHS);
function normalizeDonationDisplayName(value) {
    if (typeof value !== 'string') return 'ANONYMOUS';
    // Bound work before Unicode expansion; this is much longer than the display limit.
    const text = Array.from(value.slice(0, 1024)).join('').normalize('NFD')
        .replace(/\p{M}/gu, '').replace(/[‘’]/g, '\'').replace(/[“”]/g, '"')
        .replace(/[‐‑‒–—−]/g, '-').replace(/\s/g, ' ')
        .replace(/\p{Cc}/gu, '').toUpperCase();
    const name = Array.from(text, char => allowed.has(char) ? char : '?').join('').replace(/ +/g, ' ').trim();
    if (!name) return 'ANONYMOUS';
    return name.length > 32 ? name.slice(0, 29) + '...' : name;
}
module.exports = { DONOR_GLYPHS, normalizeDonationDisplayName };
