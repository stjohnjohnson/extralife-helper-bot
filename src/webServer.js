const http = require('node:http');

// Owns the listener; integrations own only their registered routes and clients.
async function startWebServer({ config, signal }) {
    if (signal?.aborted) throw new Error('Web listener startup aborted');
    const requests = new Map();
    const upgrades = new Map();
    const sockets = new Set();
    let stopping;
    const server = http.createServer((req, res) => {
        const handler = requests.get(req.url.split('?')[0]);
        if (handler) handler(req, res);
        else { res.writeHead(404); res.end(); }
    });
    server.on('upgrade', (req, socket, head) => {
        const handler = upgrades.get(req.url);
        if (handler) handler(req, socket, head);
        else socket.destroy();
    });
    server.on('connection', socket => {
        sockets.add(socket); socket.once('close', () => sockets.delete(socket));
    });
    const stop = () => {
        if (!stopping) stopping = new Promise(resolve => {
            signal?.removeEventListener('abort', abort);
            requests.clear(); upgrades.clear();
            server.close(resolve);
            for (const socket of sockets) socket.destroy();
        });
        return stopping;
    };
    const abort = () => { void stop(); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
        await new Promise((resolve, reject) => {
            const cancelled = () => { cleanup(); reject(new Error('Web listener startup aborted')); };
            const cleanup = () => { server.off('error', failed); server.off('listening', listening); signal?.removeEventListener('abort', cancelled); };
            const failed = error => { cleanup(); reject(error); };
            const listening = () => { cleanup(); resolve(); };
            server.once('error', failed); server.once('listening', listening);
            signal?.addEventListener('abort', cancelled, { once: true });
            try { server.listen({ port: config.port, host: config.host, signal }); } catch (error) { failed(error); }
        });
        if (signal?.aborted) throw new Error('Web listener startup aborted');
    } catch (error) { await stop(); throw error; }
    function register(routes, paths, handler) {
        if (stopping) throw new Error('Web listener stopped');
        for (const path of paths) if (routes.has(path)) throw new Error('Web route already registered');
        for (const path of paths) routes.set(path, handler);
        return () => { for (const path of paths) if (routes.get(path) === handler) routes.delete(path); };
    }
    return { address: server.address(), stop,
        registerHttp: (paths, handler) => register(requests, paths, handler),
        registerUpgrade: (path, handler) => register(upgrades, [path], handler) };
}
module.exports = { startWebServer };
