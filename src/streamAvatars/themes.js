const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const defaults = require('../../integrations/stream-avatars/themes.json');
const THEME_IDS = Object.freeze(['block-world', 'kitchen', 'outdoor', 'puzzle', 'space-salvage', 'party']);
// This trusted artwork specification revision is replaced by the selected export manifest at packaging.
const PACK_REVISION = createHash('sha256').update(JSON.stringify(require('../../integrations/stream-avatars/artwork/inventory.json')))
    .update(JSON.stringify(require('../../integrations/stream-avatars/artwork/style.json'))).digest('hex');
function cleanGameName(value) {
    if (typeof value !== 'string') return null;
    const name = value.normalize('NFKC').replace(/\s+/gu, ' ').replace(/[\p{Cc}\p{Cf}]/gu, '').trim().replace(/\s+/gu, ' ');
    return name && [...name].length <= 200 ? name : null;
}
const normalize = value => cleanGameName(value)?.toLowerCase();
const record = value => value && typeof value === 'object' && !Array.isArray(value);
function compile(value) {
    if (!record(value) || Object.keys(value).some(key => !['games', 'aliases'].includes(key)) ||
        (value.games !== undefined && !record(value.games)) || (value.aliases !== undefined && !record(value.aliases))) throw new Error('Invalid themes');
    const games = new Map(); const aliases = new Map();
    for (const [name, themeId] of Object.entries(value.games || {})) {
        const key = normalize(name);
        if (!key || games.has(key) || !THEME_IDS.includes(themeId)) throw new Error('Invalid themes');
        games.set(key, { displayName: cleanGameName(name), themeId });
    }
    for (const [name, target] of Object.entries(value.aliases || {})) {
        const key = normalize(name); const destination = normalize(target);
        if (!key || !destination || aliases.has(key) || games.has(key)) throw new Error('Invalid themes');
        aliases.set(key, destination);
    }
    for (const key of aliases.keys()) {
        let current = key; const visited = new Set();
        while (aliases.has(current)) {
            if (visited.has(current)) throw new Error('Invalid themes');
            visited.add(current); current = aliases.get(current);
        }
        if (!games.has(current)) throw new Error('Invalid themes');
        aliases.set(key, current);
    }
    return { games, aliases };
}
function loadThemeConfiguration({ file, defaults: base = defaults } = {}) {
    try {
        const compiled = compile(base);
        if (!file) return { enabled: true, config: compiled, errors: [] };
        const override = JSON.parse(readFileSync(file, 'utf8'));
        if (!record(override) || Object.keys(override).some(key => !['games', 'aliases'].includes(key)) ||
            (override.games !== undefined && !record(override.games)) || (override.aliases !== undefined && !record(override.aliases))) throw new Error('Invalid themes');
        const merged = { games: { ...base.games, ...override.games }, aliases: { ...base.aliases, ...override.aliases } };
        return { enabled: true, config: compile(merged), errors: [] };
    } catch { return { enabled: false, config: null, errors: ['Invalid Stream Avatars theme configuration'] }; }
}
function resolveGame(gameName, config) {
    const name = cleanGameName(gameName); if (!name || !config) return null;
    const normalized = normalize(name);
    const neutral = normalized === 'just chatting';
    const key = neutral ? normalized : config.aliases.get(normalized) || normalized;
    const known = neutral ? { displayName: 'Just Chatting', themeId: null } : config.games.get(key);
    return { identity: createHash('sha256').update(key).digest('hex'), displayName: known?.displayName || name, themeId: known?.themeId || null };
}
module.exports = { loadThemeConfiguration, resolveGame, cleanGameName, THEME_IDS, PACK_REVISION };
