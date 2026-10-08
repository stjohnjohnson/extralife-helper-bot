const { createVirtualClock } = require('../src/streamAvatars/clock');
test('virtual clock advances, seeks backwards and validates bounded nonnegative time', () => {
    const clock = createVirtualClock({ nowMs: 1000 }); const values = []; const unsubscribe = clock.subscribe(value => values.push(value));
    clock.advance(3600000); expect(clock.nowMs()).toBe(3601000); clock.seek(2000); expect(clock.nowMs()).toBe(2000);
    expect(values).toEqual([3601000, 2000]); unsubscribe(); clock.advance(1); expect(values).toHaveLength(2);
    for (const time of [-1, NaN, Infinity]) { expect(() => clock.advance(time)).toThrow(); expect(() => clock.seek(time)).toThrow(); }
});
