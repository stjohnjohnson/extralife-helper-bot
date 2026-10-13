const { propPosition } = require('../../src/streamAvatars/themeLayout');
function sceneLayout(cards, width = 1920) {
    const scenery = [];
    const backdrops = [];
    const themes = [...new Set(cards.map(c => c.brief.theme))];
    for (const theme of themes) {
        const latest = new Map();
        cards.filter(c => c.brief.theme === theme && !c.brief.retired && c.validation.valid).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach(c => latest.set(c.assetId, c));
        const backdrop = [...latest.values()].find(c => c.brief.kind === 'backdrop');
        if (backdrop) {
            for (let x = 0; x < width; x += backdrop.brief.frame.width) backdrops.push({ ...backdrop, previewX: x });
        }
        const props = [...latest.values()].filter(c => c.brief.kind === 'scenery').sort((a, b) => a.assetId.localeCompare(b.assetId)).slice(0, 5);
        props.forEach((c, index) => {
            const previewX = propPosition(theme, c.assetId, c.brief.frame.width, index, props.length, width);
            scenery.push({ ...c, previewX });
        });
    }
    return { scenery, backdrops };
}
module.exports = { sceneLayout };
