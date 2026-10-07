const { calculateLayout } = require('../src/voiceOverlay/browser');
test.each([[460, 64, 1, 48], [460, 64, 5, 48], [460, 64, 10, 35.4], [540, 64, 10, 43.4]])('fits %i×%i with %i avatars', (width, height, count, want) => {
    const layout = calculateLayout({ width, height, count });
    expect(layout.diameter).toBeCloseTo(want, 1);
    expect(count * (layout.diameter + 2 * layout.ring) + (count - 1) * layout.gap + 10).toBeLessThanOrEqual(width + 0.01);
    expect(layout.diameter + 2 * layout.ring + 10).toBeLessThanOrEqual(height);
});
test.each([[320, 64, 10], [100, 32, 15], [460, 64, 100]])('even dense rows fit without wrapping or clipping %i×%i/%i', (width, height, count) => {
    const layout = calculateLayout({ width, height, count });
    expect(layout.diameter).toBeGreaterThanOrEqual(0);
    expect(count * (layout.diameter + 2 * layout.ring) + (count - 1) * layout.gap + 10).toBeLessThanOrEqual(width + 0.01);
});
test('zero count and zero viewport are safe', () => {
    expect(calculateLayout({ width: 460, height: 64, count: 0 }).diameter).toBe(0);
    expect(calculateLayout({ width: 0, height: 0, count: 10 }).diameter).toBe(0);
});
