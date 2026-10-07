const http = require('node:http');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');

async function startOverlayServer({ config, state }) {
    const routes = new Map();
    for (const [route, file, type] of [
        ['/voice', 'overlay.html', 'text/html'],
        ['/voice/browser.js', 'browser.js', 'text/javascript'],
        ['/voice/overlay.css', 'overlay.css', 'text/css']
    ]) routes.set(route, { body: await readFile(join(__dirname, file)), type });
    const clients = new Map();
    const server = http.createServer((req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', 'default-src \'none\'; script-src \'self\'; style-src \'self\'; img-src https://cdn.discordapp.com https://media.discordapp.net; connect-src \'self\'; frame-ancestors \'none\'');
        if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); res.end(); return; }
        const path = req.url.split('?')[0];
        if (path === '/voice/events') {
            res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
            const send = (event, data) => {
                if (!res.destroyed && !res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) res.destroy();
            };
            const unsubscribe = state.subscribe(snapshot => send('snapshot', snapshot));
            const heartbeat = setInterval(() => send('heartbeat', {}), 15000);
            const cleanup = () => { clearInterval(heartbeat); unsubscribe(); clients.delete(res); };
            clients.set(res, cleanup);
            res.once('close', cleanup);
            send('snapshot', state.getSnapshot());
            return;
        }
        const asset = routes.get(path);
        if (!asset) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': `${asset.type}; charset=utf-8` }); res.end(asset.body);
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, () => { server.removeListener('error', reject); resolve(); });
    });
    let stopping;
    return {
        address: server.address(),
        stop() {
            if (!stopping) stopping = new Promise((resolve, reject) => {
                for (const [client, cleanup] of clients) { cleanup(); client.destroy(); }
                server.close(error => error ? reject(error) : resolve());
                server.closeAllConnections();
            });
            return stopping;
        }
    };
}
module.exports = { startOverlayServer };
