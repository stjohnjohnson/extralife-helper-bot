// Public donation amounts are decimal dollars. All accounting is integer cents.
function parseCents(value) {
    if (value === null || value === undefined) return null;
    if (!['string', 'number'].includes(typeof value)) throw new Error('Invalid donation amount');
    const text = String(value);
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Invalid donation amount');
    const [whole, fraction = ''] = text.split('.');
    const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Unsafe donation amount');
    return Number(cents);
}
function addCents(a, b) {
    if (![a, b, a + b].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Unsafe money total');
    return a + b;
}
module.exports = { parseCents, addCents };
