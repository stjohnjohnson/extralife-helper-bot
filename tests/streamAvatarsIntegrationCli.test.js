const mockHue = { initialize: jest.fn(), celebrateDonation: jest.fn(), stop: jest.fn() };
jest.mock('../src/hueControl', () => ({ HueController: jest.fn(() => mockHue) }));
jest.mock('../src/streamAvatars/integration', () => ({ runIntegration: jest.fn().mockResolvedValue({ completedScenarios: [] }) }));
const { HueController } = require('../src/hueControl');
const { runIntegration } = require('../src/streamAvatars/integration');
const { run } = require('../scripts/sa-integration');
const env = { WEB_HOST: '127.0.0.1', WEB_PORT: '3010', STREAM_AVATARS_TOKEN: 't'.repeat(32), HUE_USERNAME: 'private', HUE_IPADDRESS: '192.168.1.4', HUE_GROUPID: '1', STREAM_AVATARS_STATE_DIR: '/production-must-not-be-used' };
beforeEach(() => jest.clearAllMocks());
test('Hue environment never initializes a Hue controller without explicit --hue', async () => {
    await run(['--scenario','milestone','--crowd','100'],env);
    expect(HueController).not.toHaveBeenCalled();
    expect(runIntegration).toHaveBeenCalledWith(expect.objectContaining({ token: env.STREAM_AVATARS_TOKEN, scenario: 'milestone', crowdCount: 100, listenerConfig: { host: '127.0.0.1', port: 3010, errors: [] }, hueOutput: undefined }));
    expect(JSON.stringify(runIntegration.mock.calls[0][0])).not.toContain('/production-must-not-be-used');
});
test('--hue constructs only the Hue controller with Hue-specific configuration', async () => {
    await run(['--hue'],env);
    expect(HueController).toHaveBeenCalledWith({ hue: { username: 'private', ipAddress: '192.168.1.4', groupId: '1', chatControlEnabled: false } },console);
    expect(runIntegration).toHaveBeenCalledWith(expect.objectContaining({ hueOutput: mockHue }));
});
test.each([['--crowd','NaN'],['--unknown'],['--scenario']])('invalid CLI flags reject without creating any controller: %j',async(...args) => {
    await expect(run(args,env)).rejects.toThrow(/Use/); expect(HueController).not.toHaveBeenCalled(); expect(runIntegration).not.toHaveBeenCalled();
});
test('invalid optional Hue settings and listener settings fail clearly', async () => {
    await expect(run(['--hue'],{ ...env,HUE_GROUPID:'NaN' })).rejects.toThrow(/HUE_GROUPID/);
    await expect(run([],{ ...env,WEB_PORT:'NaN' })).rejects.toThrow(/WEB_PORT/);
    expect(runIntegration).not.toHaveBeenCalled();
});
