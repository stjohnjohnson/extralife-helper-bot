const { normalizeDonationDisplayName } = require('../src/donations/displayName');

test.each([
    [' José O’Neil: "Hi",. ', 'JOSE O\'NEIL: "HI",.'],
    ['Alice 😀', 'ALICE ?'], [null, 'ANONYMOUS'], ['', 'ANONYMOUS'], [42, 'ANONYMOUS'],
    [' \t\n ', 'ANONYMOUS'], ['A\tB\nC\u0000D', 'A B CD'],
    ['élève — “oui”', 'ELEVE - "OUI"'], ['東京', '??'], ['𝕒', '?'],
    ['.,:-\'"', '.,:-\'"'], ['A'.repeat(40), 'A'.repeat(29) + '...'],
    ['😀'.repeat(100000), '?'.repeat(29) + '...']
])('normalizes public donation name %j', (value, expected) => {
    expect(normalizeDonationDisplayName(value)).toBe(expected);
});
