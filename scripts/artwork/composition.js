function sceneLayout(cards, width = 1920) {
    const scenery = [];
    const backdrops = [];
    const themes = [...new Set(cards.map(c => c.brief.theme))];
    for (const theme of themes) {
        const latest = new Map();
        cards.filter(c => c.brief.theme === theme && c.validation.valid).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach(c => latest.set(c.assetId, c));
        const backdrop = [...latest.values()].find(c => c.brief.kind === 'backdrop');
        if (backdrop) {
            for (let x = 0; x < width; x += backdrop.brief.frame.width) backdrops.push({ ...backdrop, previewX: x });
        }
        const props = [...latest.values()].filter(c => c.brief.kind === 'scenery').sort((a, b) => a.assetId.localeCompare(b.assetId)).slice(0, 5);
        props.forEach((c, index) => {
            let seed = 0;
            for (const char of `${theme}:${c.assetId}`) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0;
            const jitter = (seed % 101) - 50;
            const center = width * (index + 1) / (props.length + 1);
            const previewX = Math.max(0, Math.min(width - c.brief.frame.width, Math.round(center - c.brief.frame.width / 2 + jitter)));
            scenery.push({ ...c, previewX });
        });
    }
    return { scenery, backdrops };
}
module.exports = { sceneLayout };
