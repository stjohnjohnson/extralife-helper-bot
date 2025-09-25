// Basic test to verify Jest setup
describe('Basic Test Setup', () => {
    test('should handle basic math', () => {
        expect(2 + 2).toBe(4);
    });

    test('should handle string operations', () => {
        const result = 'user1,user2'.split(',').map(s => s.trim());
        expect(result).toEqual(['user1', 'user2']);
    });

    test('should handle async operations', async () => {
        const asyncFunction = async () => 'hello world';
        const result = await asyncFunction();
        expect(result).toBe('hello world');
    });
});
