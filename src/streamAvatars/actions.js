function parseAction(input) {
    if (typeof input !== 'string') throw new Error('Invalid Stream Avatars command');
    const words = input.trim().toLowerCase().split(/\s+/);
    if (words.length === 1 && words[0] === 'status') return { name: 'status', args: [] };
    if (words.length === 3 && words[0] === 'session' && ['reset','recover'].includes(words[1]) && words[2] === 'confirm') return { name: 'session.' + words[1], args: [] };
    throw new Error('Use !sa status or session reset|recover confirm. For development effects use npm run sa:integration.');
}
module.exports = { parseAction };
