const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
test.each(['auth', 'movement', 'density', 'cleanup', 'expiry', 'generation', 'crowd', 'invalid', 'missing-image', 'reconnect'])('shipped Lua companion: %s', scenario => {
    const result = spawnSync(process.env.LUA_BIN || 'lua', [resolve('tests/lua/companionHarness.lua'), resolve('integrations/stream-avatars/companion.lua'), scenario], { encoding: 'utf8' });
    if (result.error) throw new Error('Install Lua 5.4+ or set LUA_BIN: ' + result.error.code);
    expect({ status: result.status, stderr: result.stderr, stdout: result.stdout.trim() }).toEqual({ status: 0, stderr: '', stdout: 'OK ' + scenario });
});
