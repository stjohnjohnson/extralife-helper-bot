const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { decodeClientMessage, validateServerMessage } = require('./protocol');
async function startBridgeServer({ config, getSnapshot, onClientMessage = async () => {}, logger = { warn() {} }, signal }) {
    if (signal?.aborted) throw new Error('Stream Avatars startup aborted');
    const server = http.createServer((req, res) => { res.writeHead(404); res.end(); });
    const wss = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false });
    const clients = new Map();
    let stopping;
    server.on('upgrade', (req, socket, head) => {
        if (req.url !== '/sa/socket' || clients.size >= 4 || signal?.aborted) { socket.destroy(); return; }
        wss.handleUpgrade(req, socket, head, connection => wss.emit('connection', connection));
    });
    function sendTo(socket, record, message) {
        if (!record.authenticated || socket.readyState !== WebSocket.OPEN) return false;
        const body = JSON.stringify(validateServerMessage(message));
        if (socket.bufferedAmount + Buffer.byteLength(body) > 65536 || record.pending >= 32) { socket.terminate(); return false; }
        record.pending++; socket.send(body, () => { record.pending--; }); return true;
    }
    wss.on('connection', socket => {
        const record = { authenticated: false, pending: 0, lastSeen: Date.now(), busy: false };
        clients.set(socket, record);
        const timeout = setTimeout(() => { if (!record.authenticated) socket.close(1008, 'Authentication required'); }, config.authTimeoutMs ?? 5000);
        socket.on('error', () => {});
        socket.on('close', () => { clearTimeout(timeout); clients.delete(socket); });
        socket.on('message', async (raw, binary) => {
            try {
                if (binary || record.busy) throw new Error('Invalid message');
                const message = decodeClientMessage(raw.toString());
                record.lastSeen = Date.now();
                if (!record.authenticated) {
                    const expected = Buffer.from(config.token); const provided = Buffer.from(message.token || '');
                    if (message.type !== 'auth' || expected.length !== provided.length || !timingSafeEqual(expected, provided)) throw new Error('Authentication failed');
                    record.authenticated = true; clearTimeout(timeout);
                    sendTo(socket, record, getSnapshot()); return;
                }
                if (message.type === 'auth') throw new Error('Already authenticated');
                record.busy = true;
                try { await onClientMessage(message); } finally { record.busy = false; }
            } catch { logger.warn('Stream Avatars connection rejected'); socket.close(1008, 'Invalid message'); }
        });
    });
    const heartbeat = setInterval(() => {
        for (const [socket, record] of clients) {
            if (Date.now() - record.lastSeen >= 30000) socket.terminate();
            else sendTo(socket, record, { version: 1, type: 'heartbeat', serverNowMs: Date.now() });
        }
    }, 15000); heartbeat.unref();
    const stop = () => {
        if (!stopping) stopping = (async () => {
            signal?.removeEventListener('abort', abort);
            clearInterval(heartbeat); for (const socket of clients.keys()) socket.terminate();
            await new Promise(resolve => wss.close(resolve));
            await new Promise(resolve => server.close(resolve)); server.closeAllConnections();
        })();
        return stopping;
    };
    const abort = () => { void stop(); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(config.port, config.host, () => { server.removeListener('error', reject); resolve(); });
        });
        if (signal?.aborted) throw new Error('Stream Avatars startup aborted');
    } catch (error) { await stop(); throw error; }
    return { address: server.address(),
        getStatus: () => ({ authenticatedClients: [...clients.values()].filter(record => record.authenticated).length }),
        disconnectClients() { for (const socket of clients.keys()) socket.terminate(); },
        send(message) { validateServerMessage(message); let delivered = false; for (const [socket, record] of clients) delivered = sendTo(socket, record, message) || delivered; return delivered; },
        stop };
}
module.exports = { startBridgeServer };
