const { spawnSync } = require('node:child_process'); const fs = require('node:fs/promises'); const net = require('node:net');
const { join } = require('node:path'); const { tmpdir } = require('node:os');
test('local CLI exercises shared rehearsal without real credentials or a production store', async () => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'sa-cli-')); const reservation = net.createServer();
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve)); const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    const env = { ...process.env, WEB_HOST: '127.0.0.1', WEB_PORT: String(port), STREAM_AVATARS_TOKEN: 'a'.repeat(32), STREAM_AVATARS_STATE_DIR: directory };
    for (const key of Object.keys(env)) if (/^(TWITCH_|DISCORD_|EXTRALIFE_|HUE_)/.test(key)) delete env[key];
    try {
        const result = spawnSync(process.execPath, ['scripts/sa-rehearse.js'], { env, encoding: 'utf8', input: 'status\ncrowd 3\nhearts\nclear\nquit\n', timeout: 5000 });
        expect(result.status).toBe(0); expect(result.stdout).toContain('Rehearsal'); expect(result.stdout).toContain('3'); expect(result.stderr).toBe('');
        expect(await fs.readdir(directory)).toEqual([]);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
