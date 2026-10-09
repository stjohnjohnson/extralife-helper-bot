const { parseWebServerConfiguration } = require('../src/webServerConfig');
test('shared listener defaults to LAN port 3000', () => {
    expect(parseWebServerConfiguration({})).toEqual({ host: '0.0.0.0', port: 3000, errors: [] });
});
test('legacy voice settings configure both integrations with shared values taking precedence', () => {
    expect(parseWebServerConfiguration({ VOICE_OVERLAY_HOST: '127.0.0.1', VOICE_OVERLAY_PORT: '4321' })).toEqual({ host: '127.0.0.1', port: 4321, errors: [] });
    expect(parseWebServerConfiguration({ WEB_HOST: '0.0.0.0', WEB_PORT: '4322', VOICE_OVERLAY_HOST: '', VOICE_OVERLAY_PORT: 'invalid' })).toEqual({ host: '0.0.0.0', port: 4322, errors: [] });
});
test.each(['0', '65536', '1e3', 'NaN', '1.5', '', ' 3000 '])('invalid shared port is diagnosed without falling back: %s', port => {
    expect(parseWebServerConfiguration({ WEB_PORT: port, VOICE_OVERLAY_PORT: '4321' }).errors).toEqual(['WEB_PORT must be an integer between 1 and 65535']);
});
test('an empty shared host is diagnosed without falling back', () => {
    expect(parseWebServerConfiguration({ WEB_HOST: ' ', VOICE_OVERLAY_HOST: '127.0.0.1' }).errors).toEqual(['WEB_HOST must not be empty']);
});
