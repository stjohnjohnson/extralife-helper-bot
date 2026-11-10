const { handleStreamAvatarsCommand } = require('../src/streamAvatars/commands');
const config = { twitch: { channel: 'channel', admins: ['admin'] } };
const logger = { info: jest.fn(), warn: jest.fn() };
let service; let count; let nextId = 0;
beforeEach(() => { count = 0; service = { dispatch: async action => { count++; return { status: 'ok', message: action.name }; }, getStatus: () => ({ mode: 'production', crowdCount: 20, campaignTotalCents: 252500, campaignGoalCents: 1000000, nextMilestoneCents: 300000, companionConnected: true, recoveryRequired: false }) }; });
function context(patch = {}) { return { channel: '#channel', userId: 'wrong-display-id', username: 'Some Display Name', tags: { username: 'AdMiN', id: 'command-' + (++nextId), 'tmi-sent-ts': '100000' }, ...patch }; }
const run = (input, source = context(), target = service) => handleStreamAvatarsCommand(input, source, { config, service: target, logger, nowMs: () => 100000 });
test.each([['campaign reset confirm','campaign.reset'],['campaign recover confirm','campaign.recover']])('admin routes %s without trusting display name', async (input, expected) => { expect(await run(input)).toBe(expected); expect(count).toBe(1); });
test('status explains mode, campaign progress, crowd, companion and recovery without leaking config', async () => { expect(await run('status')).toBe('20 avatars hanging out! We’ve raised $2,525 toward our $10,000 goal. Next milestone: $3,000. Stream Avatars is connected.'); expect(count).toBe(0); });
test.each([
    { tags: { username: 'viewer', id: 'a', 'tmi-sent-ts': '100000' }, userId: 'admin', username: 'admin' },
    { tags: { id: 'a', 'tmi-sent-ts': '100000' }, userId: 'admin' },
    { channel: '#other' },
    { tags: { username: 'admin', id: 'a', 'tmi-sent-ts': '100000', 'source-room-id': 'foreign', 'room-id': 'local' } }
])('denies unauthorized or forwarded control %j', async patch => { expect(await run('campaign reset confirm', context(patch))).toMatch(/permission|channel/i); expect(count).toBe(0); });
test('duplicate message and expired timestamp execute nothing additional', async () => {
    const same = context(); await run('campaign reset confirm', same); expect(await run('campaign reset confirm', same)).toBeNull(); expect(count).toBe(1);
    expect(await run('campaign reset confirm', context({ tags: { username: 'admin', id: 'old', 'tmi-sent-ts': '1000' } }))).toBe('I couldn’t verify that command. Please send it again.'); expect(count).toBe(1);
});
test('invalid command, missing message identity and unavailable service cannot execute', async () => {
    expect(await run('campaign reset')).toMatch(/confirm|Use/i);
    expect(await run('clock advance -1h')).toMatch(/Use/i);
    expect(await run('campaign reset confirm', context({ tags: { username: 'admin' } }))).toBe('I couldn’t verify that command. Please send it again.');
    expect(await run('campaign reset confirm', context(), null)).toMatch(/disabled|unavailable/i);
    expect(count).toBe(0);
});

test.each(['reset', 'recover'])('game %s requires an explicit confirmation and an administrator', async verb => {
    expect(await run('game ' + verb)).toMatch(/confirm|Use/);
    expect(await run('game ' + verb + ' confirm', context({ tags: { username: 'viewer', id: 'game-viewer-' + verb, 'tmi-sent-ts': '100000' } }))).toMatch(/permission/);
    expect(count).toBe(0);
    expect(await run('game ' + verb + ' confirm')).toBe('game.' + verb);
    expect(count).toBe(1);
});
test('status exposes the independent game recovery gate', async () => {
    const target = { ...service, getStatus: () => ({ ...service.getStatus(), gameRecoveryRequired: true }) };
    expect(await run('status', context(), target)).toContain('The game needs recovery. Use !sa game recover confirm while the stream is offline.');
});

const statusWith = patch => ({ ...service, getStatus: () => ({ ...service.getStatus(), ...patch }) });
test('status uses singular grammar and preserves cents', async () => {
    expect(await run('status', context(), statusWith({ crowdCount: 1, campaignTotalCents: 252501 })))
        .toContain('1 avatar hanging out! We’ve raised $2,525.01');
});
test('status explains unavailable campaign amounts without implying zero', async () => {
    const result = await run('status', context(), statusWith({ campaignTotalCents: null, campaignGoalCents: null, nextMilestoneCents: null }));
    expect(result).toContain('We’re waiting for the campaign total and goal.');
    expect(result).toContain('We’re waiting for the next milestone.');
    expect(result).not.toContain('$0');
});
test.each([
    [{ campaignTotalCents: null }, 'We’re waiting for the campaign total. Our goal is $10,000.'],
    [{ campaignGoalCents: null }, 'We’ve raised $2,525. We’re waiting for the campaign goal.'],
    [{ campaignTotalCents: 0, campaignGoalCents: 0 }, 'We’ve raised $0 toward our $0 goal.'],
    [{ companionConnected: false }, 'Stream Avatars is disconnected.'],
    [{ mode: 'integration' }, 'Test mode.'],
    [{ recoveryRequired: true }, 'The campaign needs recovery. Use !sa campaign recover confirm.'],
    [{ reconciliationRequired: true }, 'I’m checking the latest donation totals before resuming effects.']
])('status explains %j', async (patch, message) => {
    expect(await run('status', context(), statusWith(patch))).toContain(message);
    expect(count).toBe(0);
});
