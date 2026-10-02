const LEGACY_EMOTES = new Set([
    '4Head',
    'ANELE',
    'BibleThump',
    'CoolCat',
    'DansGame',
    'EleGiggle',
    'ExtraLife',
    'FailFish',
    'FrankerZ',
    'HeyGuys',
    'Jebaited',
    'KAPOW',
    'Kappa',
    'KappaPride',
    'Keepo',
    'Kreygasm',
    'LUL',
    'MingLee',
    'NotLikeThis',
    'PJSalt',
    'PogChamp',
    'ResidentSleeper',
    'SeemsGood',
    'SMOrc',
    'SwiftRage',
    'TriHard',
    'VoHiYo',
    'WutFace'
]);

function legacyEmotes(text) {
    const value = String(text || '');
    const colonEmotes = [...value.matchAll(/:([\p{L}\p{N}_-]+):/gu)].map(match => match[1]);
    const bareEmotes = (value.replace(/:[\p{L}\p{N}_-]+:/gu, ' ').match(/[\p{L}\p{N}_]+/gu) || [])
        .filter(token => LEGACY_EMOTES.has(token));
    return [...bareEmotes, ...colonEmotes];
}

function taggedEmotes(text, emoteTags) {
    if (!emoteTags || typeof emoteTags !== 'object') return [];
    const positions = Object.values(emoteTags)
        .flat()
        .map(range => String(range).split('-').map(Number))
        .filter(([start, end]) => Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start)
        .sort(([left], [right]) => left - right);
    return positions.map(([start, end]) => String(text || '').slice(start, end + 1));
}

module.exports = { legacyEmotes, taggedEmotes };
