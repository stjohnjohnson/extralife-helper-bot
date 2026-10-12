const mockHue = { initialize: jest.fn(), celebrateDonation: jest.fn(), stop: jest.fn() };
jest.mock('../src/hueControl', () => ({ HueController: jest.fn(() => mockHue) }));
jest.mock('../src/streamAvatars/integration', () => ({ runIntegration: jest.fn().mockResolvedValue({ completedScenarios: [] }) }));
const { HueController } = require('../src/hueControl');
const { runIntegration } = require('../src/streamAvatars/integration');
const { run } = require('../scripts/sa-integration');
const fs = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createThemePack } = require('./helpers/themePack');
let packRoot, candidate, approved;
beforeAll(() => { packRoot = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'sa-cli-pack-'))); fs.mkdirSync(join(packRoot, 'preview')); fs.mkdirSync(join(packRoot, 'proven')); candidate = createThemePack(join(packRoot, 'preview')); approved = createThemePack(join(packRoot, 'proven'), { approved: true }); });
afterAll(() => fs.rmSync(packRoot, { recursive: true, force: true }));
const env = { WEB_HOST: '127.0.0.1', WEB_PORT: '3010', STREAM_AVATARS_TOKEN: 't'.repeat(32), HUE_USERNAME: 'private', HUE_IPADDRESS: '192.168.1.4', HUE_GROUPID: '1', STREAM_AVATARS_STATE_DIR: '/production-must-not-be-used' };
beforeEach(() => { jest.clearAllMocks(); env.STREAM_AVATARS_THEME_PACK = approved.directory; });
test('Hue environment never initializes a Hue controller without explicit --hue', async () => {
    await run(['--scenario','milestone','--crowd','100'],env);
    expect(HueController).not.toHaveBeenCalled();
    expect(runIntegration).toHaveBeenCalledWith(expect.objectContaining({ token: env.STREAM_AVATARS_TOKEN, scenario: 'milestone', crowdCount: 100, recognition: 'random', listenerConfig: { host: '127.0.0.1', port: 3010, errors: [] }, hueOutput: undefined }));
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

test.each(['jump','hug','random'])('developer CLI passes explicit recognition %s', async recognition => {
    await run(['--recognition', recognition], env);
    expect(runIntegration).toHaveBeenCalledWith(expect.objectContaining({ recognition }));
    expect(HueController).not.toHaveBeenCalled();
});
test.each([['--recognition'],['--recognition','explode']])('invalid recognition fails before initializing output: %j', async (...args) => {
    await expect(run([...args, '--hue'], env)).rejects.toThrow(/recognition|Use/);
    expect(runIntegration).not.toHaveBeenCalled(); expect(HueController).not.toHaveBeenCalled();
});

test.each([
    [['--scenario','themes','--theme','all','--candidate-pack','CANDIDATE'], { scenario: 'themes', theme: 'all', candidatePackDir: 'CANDIDATE' }],
    [['--scenario','ordinary','--theme','kitchen','--theme-pack','APPROVED'], { scenario: 'ordinary', theme: 'kitchen', themePackDir: 'APPROVED' }],
    [['--game','Keep Talking and Nobody Explodes'], { game: 'Keep Talking and Nobody Explodes' }]
])('theme controls are forwarded to the isolated integration runner: %j', async (args, expected) => {
    const paths = { CANDIDATE: candidate.directory, APPROVED: approved.directory };
    await run(args.map(arg => paths[arg] || arg), env);
    expect(runIntegration).toHaveBeenCalledWith(expect.objectContaining(Object.fromEntries(Object.entries(expected).map(([key,value]) => [key,paths[value] || value]))));
    expect(HueController).not.toHaveBeenCalled();
});

test.each([' ', 'a'.repeat(201), '😀'.repeat(201), '\u0000\u200b'])('malformed CLI game fails before even constructing Hue: %j', async game => {
    await expect(run(['--game', game, '--hue'], env)).rejects.toThrow(/game name/i);
    expect(runIntegration).not.toHaveBeenCalled(); expect(HueController).not.toHaveBeenCalled();
});
test.each(['Minecraft Bedrock', '😀'.repeat(200), '深夜のゲーム'])('valid Unicode names and aliases remain accepted: %s', async game => {
    await run(['--game', game], env);
    expect(runIntegration).toHaveBeenCalledWith(expect.objectContaining({ game }));
});


test('approved environment pack is used for literal all', async () => {
    await run(['--scenario','all','--crowd','20'], env);
    expect(runIntegration).toHaveBeenCalledWith(expect.objectContaining({ scenario: 'all', crowdCount: 20, themePackDir: approved.directory, candidatePackDir: undefined }));
});
test('a candidate environment pack cannot bypass approved-pack validation or initialize Hue', async () => {
    await expect(run(['--hue'], { ...env, STREAM_AVATARS_THEME_PACK: candidate.directory })).rejects.toThrow(/explicit rehearsal preview|candidate-pack/i);
    expect(runIntegration).not.toHaveBeenCalled(); expect(HueController).not.toHaveBeenCalled();
});
test('explicit preview pack overrides invalid environment pack', async () => {
    await run(['--candidate-pack', candidate.directory], { ...env, STREAM_AVATARS_THEME_PACK: join(packRoot, 'missing') });
    expect(runIntegration).toHaveBeenCalledWith(expect.objectContaining({ candidatePackDir: candidate.directory, themePackDir: undefined }));
});
test.each(['candidate-pack','theme-pack'])('invalid explicit %s fails before Hue and does not fall back', async flag => {
    await expect(run(['--' + flag, join(packRoot, 'missing'), '--hue'], env)).rejects.toThrow(/theme pack.*candidate-pack|candidate-pack.*theme pack/i);
    expect(runIntegration).not.toHaveBeenCalled(); expect(HueController).not.toHaveBeenCalled();
});
test('conflicting explicit packs reject before Hue', async () => {
    await expect(run(['--candidate-pack', candidate.directory, '--theme-pack', approved.directory, '--hue'], env)).rejects.toThrow(/Choose one theme pack/i);
    expect(runIntegration).not.toHaveBeenCalled(); expect(HueController).not.toHaveBeenCalled();
});


test('preview fallback uses only a validated portable local pack when themes are required', () => {
    const { resolveIntegrationPack } = require('../src/streamAvatars/integrationPack');
    expect(resolveIntegrationPack({ required: true, defaultPackDir: candidate.directory })).toMatchObject({ candidatePackDir: candidate.directory, themePackDir: undefined, packRevision: candidate.packRevision });
    expect(resolveIntegrationPack({ required: false, defaultPackDir: join(packRoot, 'missing') })).toEqual({});
    expect(() => resolveIntegrationPack({ required: true, defaultPackDir: join(packRoot, 'missing') })).toThrow(/theme pack.*candidate-pack|candidate-pack.*theme pack/i);
});
test.each(['', 'https://example.invalid/pack'])('invalid configured environment pack cannot fall through to a local preview: %j', environmentPackDir => {
    const { resolveIntegrationPack } = require('../src/streamAvatars/integrationPack');
    expect(() => resolveIntegrationPack({ required: true, environmentPackDir, defaultPackDir: candidate.directory })).toThrow(/theme pack.*candidate-pack|candidate-pack.*theme pack/i);
});
test('a corrupt local preview pack is rejected rather than replaced with a specification catalog', () => {
    const { resolveIntegrationPack } = require('../src/streamAvatars/integrationPack');
    const directory = join(packRoot, 'corrupt'); fs.cpSync(candidate.directory, directory, { recursive: true });
    const manifest = JSON.parse(fs.readFileSync(join(directory, 'manifest.json')));
    fs.appendFileSync(join(directory, Object.values(manifest.assets)[0].exportFile), 'corrupt');
    expect(() => resolveIntegrationPack({ required: true, defaultPackDir: directory })).toThrow(/checksum/i);
});


test('explicit approved pack overrides a candidate environment without opening the preview gate', async () => {
    await run(['--theme-pack', approved.directory], { ...env, STREAM_AVATARS_THEME_PACK: candidate.directory });
    expect(runIntegration).toHaveBeenCalledWith(expect.objectContaining({ themePackDir: approved.directory, candidatePackDir: undefined }));
});
test('focused donation-only CLI does not require a preview pack', async () => {
    await run(['--scenario', 'ordinary'], { ...env, STREAM_AVATARS_THEME_PACK: undefined });
    expect(runIntegration).toHaveBeenCalledWith(expect.objectContaining({ scenario: 'ordinary', themePackDir: undefined, candidatePackDir: undefined }));
});
