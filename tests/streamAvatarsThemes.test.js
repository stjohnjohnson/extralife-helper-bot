const fs = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
let themes;
beforeAll(() => { themes = require('../src/streamAvatars/themes'); });
const mappings = {
    'block-world': ['Minecraft', 'Minecraft Bedrock'], kitchen: ['PlateUp!'],
    outdoor: ['Big Walk', 'PEAK', 'Valheim', 'Raft', 'Enshrouded', 'Core Keeper', 'How to Fish', 'RV There Yet?'],
    puzzle: ['Escape Simulator 2', 'We Were Here', 'Keep Talking and Nobody Explodes'],
    'space-salvage': ['Helldivers 2', 'Deep Rock Galactic', 'Void Crew', 'Jump Space', 'Arc Raiders', 'R.E.P.O.', 'Call of Duty'],
    party: ['Party Animals', 'Ultimate Chicken Horse', 'MECCHA CHAMELEON', 'Heave Ho 2', 'Tricky Towers', 'Make Way', 'Goat Simulator 3', 'Moving Out 2', 'Gamble With Your Friends', 'Jackbox Party Packs', 'Golf with Friends', 'Wobbly Life']
};
test.each(Object.entries(mappings).flatMap(([themeId, names]) => names.map(name => [name, themeId])))('%s resolves to %s', (name, themeId) => {
    expect(themes.resolveGame(name, themes.loadThemeConfiguration().config).themeId).toBe(themeId);
});
test('normalizes unicode, case, whitespace and explicit canonical aliases without fuzzy matching', () => {
    const config = themes.loadThemeConfiguration().config;
    expect(themes.resolveGame('  ＭＩＮＥＣＲＡＦＴ   BEDROCK ', config)).toEqual(themes.resolveGame('Minecraft', config));
    for (const alias of ['The Jackbox Survey Scramble', 'The Jackbox Party Pack 11']) expect(themes.resolveGame(alias, config)).toEqual(themes.resolveGame('Jackbox Party Packs', config));
    expect(themes.resolveGame('Minecraft-like game', config).themeId).toBeNull();
    expect(themes.resolveGame('Just Chatting', config).themeId).toBeNull();
});
test('strips controls and rejects empty or over-200-code-point game names', () => {
    const config = themes.loadThemeConfiguration().config;
    expect(themes.resolveGame(' Mine\u0000craft\u202e ', config).displayName).toBe('Minecraft');
    expect(themes.resolveGame('😀'.repeat(200), config).displayName).toHaveLength(400);
    for (const name of ['', '\u0000\u202e', '😀'.repeat(201), null]) expect(themes.resolveGame(name, config)).toBeNull();
});
test.each([
    { games: { Minecraft: 'invalid-theme' } },
    { aliases: { a: 'b', b: 'a' } },
    { aliases: { MINECRAFT: 'Raft' } },
    { aliases: { 'some alias': 'Minecraft', ' SOME  ALIAS ': 'Raft' } },
    { games: { 'MineCraft': 'party' } },
    { executable: 'bad' }
])('invalid override disables themes with sanitized errors: %j', override => {
    const dir = fs.mkdtempSync(join(tmpdir(), 'sa-themes-'));
    try {
        const file = join(dir, 'override.json'); fs.writeFileSync(file, JSON.stringify(override));
        const result = themes.loadThemeConfiguration({ file });
        expect(result.enabled).toBe(false); expect(result.config).toBeNull(); expect(result.errors).toEqual(['Invalid Stream Avatars theme configuration']);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('valid override adds exact mappings and aliases; aliases follow chains', () => {
    const result = themes.loadThemeConfiguration({ defaults: { games: { 'Custom Game': 'party' }, aliases: { alias: 'next', next: 'Custom Game' } } });
    expect(result.enabled).toBe(true);
    expect(themes.resolveGame('alias', result.config)).toMatchObject({ displayName: 'Custom Game', themeId: 'party' });
});
test('tabs and newlines normalize as whitespace without joining separate words', () => {
    const config = themes.loadThemeConfiguration().config;
    expect(themes.resolveGame('Minecraft\t\nBedrock', config)).toEqual(themes.resolveGame('Minecraft', config));
});
test.each([{ games: null }, { aliases: null }, { games: [] }, { aliases: 'text' }])('malformed defaults fail closed for themes only %j', defaults => {
    expect(themes.loadThemeConfiguration({ defaults })).toMatchObject({ enabled: false, config: null });
});
test('explicit Just Chatting stays neutral even if an override tries to map or alias it', () => {
    const mapped = themes.loadThemeConfiguration({ defaults: { games: { 'Just Chatting': 'party' }, aliases: {} } });
    const aliased = themes.loadThemeConfiguration({ defaults: { games: { Minecraft: 'block-world' }, aliases: { 'Just Chatting': 'Minecraft' } } });
    for (const result of [mapped, aliased]) expect(themes.resolveGame('Just Chatting', result.config)).toMatchObject({ displayName: 'Just Chatting', themeId: null });
});
