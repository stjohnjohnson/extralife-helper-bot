const { parseStreamAvatarsConfiguration } = require('../src/streamAvatars/config');
const valid = { STREAM_AVATARS_TOKEN: 'a'.repeat(32) };
test('bridge always requires a private token', () => {
    expect(parseStreamAvatarsConfiguration({}).errors).toContain('STREAM_AVATARS_TOKEN must contain 16 to 256 non-whitespace characters');
});
test('valid bridge uses defaults without an enable switch', () => {
    const result = parseStreamAvatarsConfiguration(valid);
    expect(result).toMatchObject({ errors: [], config: { donationIntervalCents: 50000 } });
    expect(result).not.toHaveProperty('enabled');
});
test.each([{ STREAM_AVATARS_TOKEN: '' }, { STREAM_AVATARS_TOKEN: ' '.repeat(32) }, { STREAM_AVATARS_TOKEN: 'a b'.repeat(8) }, { STREAM_AVATARS_STATE_DIR: '' }, { STREAM_AVATARS_STATE_DIR: '  ' }])('reports invalid bridge settings without exposing token: %j', patch => {
    const result = parseStreamAvatarsConfiguration({ ...valid, ...patch });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(result.errors)).not.toContain(valid.STREAM_AVATARS_TOKEN);
});
test.each(['false', 'true', 'yes'])('retired switch has no effect: %s', flag => {
    expect(parseStreamAvatarsConfiguration({ ...valid, STREAM_AVATARS_ENABLED: flag })).toEqual(parseStreamAvatarsConfiguration(valid));
});
test('geometry and density are not operator configuration', () => {
    const result = parseStreamAvatarsConfiguration({ ...valid, STREAM_AVATARS_STRIP_WIDTH: 'invalid', STREAM_AVATARS_HEART_OFFSET: 'invalid' });
    expect(result.errors).toEqual([]);
    for (const key of ['strip', 'maxHearts', 'heartOffset']) expect(result.config).not.toHaveProperty(key);
});
test('bridge settings have no independent host or port', () => {
    const settings = parseStreamAvatarsConfiguration(valid).config;
    expect(settings).not.toHaveProperty('host'); expect(settings).not.toHaveProperty('port');
});
test('donation intervals use bounded integer cents', () => {
    expect(parseStreamAvatarsConfiguration(valid).config.donationIntervalCents).toBe(50000);
    for (const value of ['0', '-1', '1.5', '100000001', '9007199254740992', 'NaN']) {
        expect(parseStreamAvatarsConfiguration({ ...valid, STREAM_AVATARS_DONATION_INTERVAL_CENTS: value }).errors).toContain('STREAM_AVATARS_DONATION_INTERVAL_CENTS must be a valid integer');
    }
    expect(parseStreamAvatarsConfiguration({ ...valid, STREAM_AVATARS_DONATION_INTERVAL_CENTS: '1' }).config.donationIntervalCents).toBe(1);
    expect(parseStreamAvatarsConfiguration({ STREAM_AVATARS_DONATION_INTERVAL_CENTS: 'invalid' }).errors).toContain('STREAM_AVATARS_DONATION_INTERVAL_CENTS must be a valid integer');
});
test('retired offline grace values have no effect on campaign integration', () => {
    const result = parseStreamAvatarsConfiguration({ ...valid, STREAM_AVATARS_OFFLINE_GRACE_SECONDS: 'invalid' });
    expect(result.errors).toEqual([]); expect(result.config).not.toHaveProperty('graceMs');
});
test('shipped theme mapping does not require external environment configuration', () => {
    const normal = parseStreamAvatarsConfiguration(valid);
    expect(normal.config.themes.enabled).toBe(true);
    expect(normal.config).not.toHaveProperty('themePackDir');
    expect(parseStreamAvatarsConfiguration({ ...valid, STREAM_AVATARS_THEME_CONFIG: '/missing/FAKE_SECRET/config.json', STREAM_AVATARS_THEME_PACK: 'https://invalid.test/pack' })).toEqual(normal);
});
test('bundled theme errors prevent valid startup configuration', () => {
    jest.isolateModules(() => {
        jest.doMock('../src/streamAvatars/themes', () => ({ loadThemeConfiguration: () => ({ enabled: false, config: null, errors: ['Invalid Stream Avatars theme configuration'] }) }));
        const { parseStreamAvatarsConfiguration: parse } = require('../src/streamAvatars/config');
        expect(parse(valid).errors).toContain('Invalid Stream Avatars theme configuration');
    });
    jest.dontMock('../src/streamAvatars/themes');
});
