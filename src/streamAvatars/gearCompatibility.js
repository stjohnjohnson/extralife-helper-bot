const { createHash } = require('node:crypto');
const inventory = require('../../integrations/stream-avatars/artwork/inventory.json');
const SET_NAME = 'sa_helper_theme_hats';
const HATS = Object.freeze(Object.fromEntries(inventory.themes.map(theme => [theme, inventory.assets.filter(a => a.theme === theme && a.kind === 'gear' && a.gearSlot === 'head').map(a => ({ assetId: a.id, setName: SET_NAME, pieceName: a.id.replaceAll('.', '_').replaceAll('-', '_') }))])));
const digest = value => createHash('sha256').update(value).digest('hex');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function validateGearCompatibility(value = { schemaVersion: 1, setName: SET_NAME, avatars: {} }) {
    if (!object(value) || value.schemaVersion !== 1 || value.setName !== SET_NAME || !object(value.avatars)) throw new Error('Invalid gear compatibility');
    const avatars = {};
    for (const avatarKey of Object.keys(value.avatars).sort()) {
        if (['__proto__', 'constructor', 'prototype'].includes(avatarKey) || !/^[a-zA-Z0-9_-]{1,128}$/.test(avatarKey) || !object(value.avatars[avatarKey])) throw new Error('Invalid gear avatar key');
        const themes = {};
        for (const theme of Object.keys(value.avatars[avatarKey]).sort()) {
            const fit = value.avatars[avatarKey][theme];
            if (!HATS[theme] || !object(fit) || fit.slot !== 'head' || !/^[a-f0-9]{64}$/.test(fit.fitRevision)) throw new Error('Invalid head gear fit');
            const piece = p => {
                if (!object(p) || p.setName !== SET_NAME || !HATS[theme].some(h => h.pieceName === p.pieceName)) throw new Error('Invalid hat piece');
                return { setName: SET_NAME, pieceName: p.pieceName };
            };
            themes[theme] = { slot: 'head', primary: piece(fit.primary), ...(fit.alternate ? { alternate: piece(fit.alternate) } : {}), fitRevision: fit.fitRevision };
        }
        avatars[avatarKey] = themes;
    }
    return { schemaVersion: 1, setName: SET_NAME, avatars };
}
module.exports = { SET_NAME, HATS, digest, object, validateGearCompatibility };
