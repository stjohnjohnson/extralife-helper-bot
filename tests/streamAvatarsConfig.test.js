const { parseStreamAvatarsConfiguration } = require('../src/streamAvatars/config');
const enabled = { STREAM_AVATARS_ENABLED: 'true', STREAM_AVATARS_TOKEN: 'a'.repeat(32) };
test('disabled bridge needs no extra configuration', () => { expect(parseStreamAvatarsConfiguration({})).toMatchObject({ enabled: false, errors: [] }); });
test('valid enabled bridge defaults to 15-minute grace with network settings owned by the shared listener', () => {
    expect(parseStreamAvatarsConfiguration(enabled)).toMatchObject({ enabled: true, errors: [], config: { graceMs: 900000 } });
});
test.each([{ STREAM_AVATARS_ENABLED: 'yes' }, { STREAM_AVATARS_TOKEN: '' }, { WEB_PORT: 'NaN' }, { WEB_HOST: ' ' }, { STREAM_AVATARS_STATE_DIR: '' }, { STREAM_AVATARS_OFFLINE_GRACE_SECONDS: '-1' }])('optional errors disable bridge without exposing token: %j', patch => {
    const result = parseStreamAvatarsConfiguration({ ...enabled, ...patch }); expect(result.enabled).toBe(false); expect(result.errors.length).toBeGreaterThan(0); expect(JSON.stringify(result.errors)).not.toContain('a'.repeat(32));
});

test('geometry and density are not operator configuration', () => {
    const result = parseStreamAvatarsConfiguration({ ...enabled, STREAM_AVATARS_STRIP_WIDTH: 'invalid', STREAM_AVATARS_HEART_OFFSET: 'invalid' });
    expect(result.enabled).toBe(true);
    for (const key of ['strip', 'maxHearts', 'heartOffset']) expect(result.config).not.toHaveProperty(key);
});

test('bridge settings have no independent host or port', () => {
    const settings = parseStreamAvatarsConfiguration(enabled).config;
    expect(settings).not.toHaveProperty('host'); expect(settings).not.toHaveProperty('port');
});
