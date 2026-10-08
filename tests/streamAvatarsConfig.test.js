const { parseStreamAvatarsConfiguration } = require('../src/streamAvatars/config');
const enabled = { STREAM_AVATARS_ENABLED: 'true', STREAM_AVATARS_TOKEN: 'a'.repeat(32), STREAM_AVATARS_STRIP_X: '0', STREAM_AVATARS_STRIP_Y: '0', STREAM_AVATARS_STRIP_WIDTH: '1920', STREAM_AVATARS_STRIP_HEIGHT: '200' };
test('disabled bridge needs no extra configuration', () => { expect(parseStreamAvatarsConfiguration({})).toMatchObject({ enabled: false, errors: [] }); });
test('valid enabled bridge defaults to independent port and 15-minute grace', () => {
    expect(parseStreamAvatarsConfiguration(enabled)).toMatchObject({ enabled: true, errors: [], config: { port: 3001, host: '0.0.0.0', graceMs: 900000, strip: { x: 0, y: 0, width: 1920, height: 200 } } });
});
test.each([{ STREAM_AVATARS_ENABLED: 'yes' }, { STREAM_AVATARS_TOKEN: '' }, { STREAM_AVATARS_PORT: 'NaN' }, { STREAM_AVATARS_HOST: ' ' }, { STREAM_AVATARS_STRIP_WIDTH: '0' }, { STREAM_AVATARS_STRIP_Y: 'Infinity' }, { STREAM_AVATARS_STATE_DIR: '' }, { STREAM_AVATARS_OFFLINE_GRACE_SECONDS: '-1' }])('optional errors disable bridge without exposing token: %j', patch => {
    const result = parseStreamAvatarsConfiguration({ ...enabled, ...patch }); expect(result.enabled).toBe(false); expect(result.errors.length).toBeGreaterThan(0); expect(JSON.stringify(result.errors)).not.toContain('a'.repeat(32));
});
