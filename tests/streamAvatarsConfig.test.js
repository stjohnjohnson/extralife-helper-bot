const { parseStreamAvatarsConfiguration } = require('../src/streamAvatars/config');
const enabled = { STREAM_AVATARS_ENABLED: 'true', STREAM_AVATARS_TOKEN: 'a'.repeat(32), STREAM_AVATARS_STRIP_X: '0', STREAM_AVATARS_STRIP_Y: '0', STREAM_AVATARS_STRIP_WIDTH: '1920', STREAM_AVATARS_STRIP_HEIGHT: '200' };
test('disabled bridge needs no extra configuration', () => { expect(parseStreamAvatarsConfiguration({})).toMatchObject({ enabled: false, errors: [] }); });
test('valid enabled bridge defaults to 15-minute grace with network settings owned by the shared listener', () => {
    expect(parseStreamAvatarsConfiguration(enabled)).toMatchObject({ enabled: true, errors: [], config: { graceMs: 900000, strip: { x: 0, y: 0, width: 1920, height: 200 } } });
});
test.each([{ STREAM_AVATARS_ENABLED: 'yes' }, { STREAM_AVATARS_TOKEN: '' }, { WEB_PORT: 'NaN' }, { WEB_HOST: ' ' }, { STREAM_AVATARS_STRIP_WIDTH: '0' }, { STREAM_AVATARS_STRIP_Y: 'Infinity' }, { STREAM_AVATARS_STATE_DIR: '' }, { STREAM_AVATARS_OFFLINE_GRACE_SECONDS: '-1' }])('optional errors disable bridge without exposing token: %j', patch => {
    const result = parseStreamAvatarsConfiguration({ ...enabled, ...patch }); expect(result.enabled).toBe(false); expect(result.errors.length).toBeGreaterThan(0); expect(JSON.stringify(result.errors)).not.toContain('a'.repeat(32));
});

test('measured game-space coordinates allow finite fractional units', () => {
    expect(parseStreamAvatarsConfiguration({ ...enabled, STREAM_AVATARS_STRIP_X: '-10.5', STREAM_AVATARS_STRIP_Y: '-8.25', STREAM_AVATARS_STRIP_WIDTH: '20.5', STREAM_AVATARS_STRIP_HEIGHT: '5.5', STREAM_AVATARS_HEART_OFFSET: '1.5' })).toMatchObject({ enabled: true, errors: [], config: { strip: { x: -10.5, y: -8.25, width: 20.5, height: 5.5 }, heartOffset: 1.5 } });
});

test('bridge settings have no independent host or port', () => {
    const settings = parseStreamAvatarsConfiguration(enabled).config;
    expect(settings).not.toHaveProperty('host'); expect(settings).not.toHaveProperty('port');
});
