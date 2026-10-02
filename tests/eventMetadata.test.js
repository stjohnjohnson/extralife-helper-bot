const { eventMetadata } = require('../src/analysis/eventMetadata.js');
const { legacyEmotes, taggedEmotes } = require('../src/analysis/emotes.js');

describe('structured event metadata', () => {
    test('adds immutable version and type fields to a readable log payload', () => {
        expect(eventMetadata('donation', { eventVersion: 99, eventType: 'wrong', amount: 25 })).toEqual({
            eventVersion: 1,
            eventType: 'donation',
            amount: 25
        });
    });

    test('rejects unsupported event types', () => {
        expect(() => eventMetadata('token', { secret: 'never-log' })).toThrow('Unsupported analysis event type');
    });

    test('recognizes repeated exact legacy emote names without guessing CamelCase words', () => {
        expect(legacyEmotes('PogChamp PogChamp ExtraLife LUL pogchamp Minecraft')).toEqual([
            'PogChamp', 'PogChamp', 'ExtraLife', 'LUL'
        ]);
    });

    test('extracts repeated tagged emotes in message order', () => {
        expect(taggedEmotes('PogChamp PogChamp ExtraLife', {
            25: ['0-7', '9-16'],
            88: ['18-26']
        })).toEqual(['PogChamp', 'PogChamp', 'ExtraLife']);
    });

    test('treats an empty structured emote tag as authoritative', () => {
        expect(taggedEmotes('PogChamp', {})).toEqual([]);
    });
});
