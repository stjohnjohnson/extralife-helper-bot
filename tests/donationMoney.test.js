const { parseCents, addCents } = require('../src/donations/money');
test.each([[0, 0], [0.1, 10], ['19.99',1999], ['001.20',120], [null,null], [undefined,null]])('exact cents: %p', (input, expected) => expect(parseCents(input)).toBe(expected));
test.each([-1, NaN, Infinity, '1.001', '', '1e3', {}, true, '900719925474099.99'])('reject invalid amount %p', value => expect(() => parseCents(value)).toThrow());
test('safe exact addition', () => { expect(addCents(10,20)).toBe(30); expect(() => addCents(Number.MAX_SAFE_INTEGER,1)).toThrow(); });
