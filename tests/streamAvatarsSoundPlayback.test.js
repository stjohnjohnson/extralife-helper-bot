const { spawnSync } = require('node:child_process');
const path = require('node:path');

test.each(['sound-ordinary', 'sound-custom', 'sound-disabled', 'sound-invalid-settings', 'sound-reload', 'sound-reconnect', 'sound-clear', 'sound-expired', 'sound-expired-party', 'sound-generation', 'sound-campaign', 'sound-faults', 'sound-clr-fault', 'sound-missing', 'sound-rotation', 'sound-pools', 'sound-invalid-pools', 'sound-pool-missing', 'sound-pool-change'])('native companion sound playback: %s', scenario => {
    const result = spawnSync(process.env.LUA_BIN || 'lua', [path.resolve(__dirname, 'lua/companionHarness.lua'), path.resolve(__dirname, '../integrations/stream-avatars/companion.lua'), scenario], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 5000 });
    expect({ status: result.status, stderr: result.stderr, stdout: result.stdout.trim() }).toEqual({ status: 0, stderr: '', stdout: 'OK ' + scenario });
});
