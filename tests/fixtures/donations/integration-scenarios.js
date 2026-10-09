// Synthetic inputs only. Loaded by the temporary development subsystem, never app.js.
module.exports = [
    { name: 'ordinary', seedCents: 0, gifts: [2500], totalCents: 2500, kind: 'donation', durationMs: 5000, caption: 'Thank you!' },
    { name: 'anonymous', seedCents: 0, gifts: [2500], anonymous: true, totalCents: 2500, kind: 'donation', durationMs: 5000, caption: 'Thank you!' },
    { name: 'batch', seedCents: 0, gifts: [1000,1500], totalCents: 2500, kind: 'donation', durationMs: 5000, caption: 'Thank you!' },
    { name: 'milestone', seedCents: 49000, gifts: [1000], totalCents: 50000, kind: 'milestone', durationMs: 18000, caption: '$500.00 raised this stream!' },
    { name: 'large', seedCents: 49000, gifts: [106000], totalCents: 155000, kind: 'milestone', durationMs: 18000, caption: '$1,550.00 raised this stream!' },
    { name: 'goal', seedCents: 0, gifts: [10000], totalCents: 10000, kind: 'goal', durationMs: 20000, caption: 'Extra Life goal reached!' }
];
