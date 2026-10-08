const { handleStreamAvatarsCommand } = require('../src/streamAvatars/commands');
const config = { twitch: { channel: 'channel', admins: ['admin'] } };
const logger = { info: jest.fn(), warn: jest.fn() };
let service; let count; let nextId = 0;
beforeEach(() => { count = 0; service = { dispatch: async action => { count++; return { status: 'ok', message: action.name }; }, getStatus: () => ({ mode: 'rehearsal', crowdCount: 20, elapsedMs: 3600000, companionConnected: true, recoveryRequired: false }) }; });
function context(patch = {}) { return { channel: '#channel', userId: 'wrong-display-id', username: 'Some Display Name', tags: { username: 'AdMiN', id: 'command-' + (++nextId), 'tmi-sent-ts': '100000' }, ...patch }; }
const run = (input, source = context(), target = service) => handleStreamAvatarsCommand(input, source, { config, service: target, logger, nowMs: () => 100000 });
test.each([['rehearsal start','rehearsal.start'],['crowd 20','crowd.count'],['crowd join 1','crowd.join'],['hearts','hearts'],['clock advance 1h','clock.advance'],['scenario reconnect','scenario'],['hue on','hue'],['session reset confirm','session.reset'],['session recover confirm','session.recover']])('admin routes %s without trusting display name', async (input, expected) => { expect(await run(input)).toBe(expected); expect(count).toBe(1); });
test('status explains mode, elapsed, crowd, companion and recovery without leaking config', async () => { expect(await run('status')).toMatch(/rehearsal.*20.*1h.*connected/i); expect(count).toBe(0); });
test.each([
    { tags: { username: 'viewer', id: 'a', 'tmi-sent-ts': '100000' }, userId: 'admin', username: 'admin' },
    { tags: { id: 'a', 'tmi-sent-ts': '100000' }, userId: 'admin' },
    { channel: '#other' },
    { tags: { username: 'admin', id: 'a', 'tmi-sent-ts': '100000', 'source-room-id': 'foreign', 'room-id': 'local' } }
])('denies unauthorized or forwarded control %j', async patch => { expect(await run('hearts', context(patch))).toMatch(/permission|channel/i); expect(count).toBe(0); });
test('duplicate message and expired timestamp execute nothing additional', async () => {
    const same = context(); await run('hearts', same); expect(await run('hearts', same)).toBeNull(); expect(count).toBe(1);
    expect(await run('hearts', context({ tags: { username: 'admin', id: 'old', 'tmi-sent-ts': '1000' } }))).toMatch(/expired/i); expect(count).toBe(1);
});
test('invalid command, missing message identity and unavailable service cannot execute', async () => {
    expect(await run('session reset')).toMatch(/confirm|Use/i);
    expect(await run('clock advance -1h')).toMatch(/Use/i);
    expect(await run('hearts', context({ tags: { username: 'admin' } }))).toMatch(/identity|expired/i);
    expect(await run('hearts', context(), null)).toMatch(/disabled|unavailable/i);
    expect(count).toBe(0);
});
