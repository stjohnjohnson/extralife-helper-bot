const { eventMetadata } = require('../src/analysis/eventMetadata.js');

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
});
