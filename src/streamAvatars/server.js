const { startWebServer } = require('../webServer');
const { timingSafeEqual } = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { decodeClientMessage, validateServerMessage } = require('./protocol');
async function startBridgeServer({ config, getSnapshot, onClientMessage = async () => {}, logger = { warn() {} }, signal, webServer }) {
    if (signal?.aborted) throw new Error('Stream Avatars startup aborted');
    const listener = webServer || await startWebServer({ config, signal });
    let unregister;
    const wss = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false });
    const clients = new Map();
    let stopping;
    const handleUpgrade = (req, socket, head) => {
        if (clients.size >= 4 || signal?.aborted) { socket.destroy(); return; }
        wss.handleUpgrade(req, socket, head, connection => wss.emit('connection', connection));
    };
    function sendTo(socket, record, message) {
        if (!record.authenticated || socket.readyState !== WebSocket.OPEN) return false;
        const body = JSON.stringify(validateServerMessage(message));
        if (socket.bufferedAmount + Buffer.byteLength(body) > 65536 || record.pending >= 32) { socket.terminate(); return false; }
        record.pending++; socket.send(body, () => { record.pending--; }); return true;
    }
    wss.on('connection', socket => {
        const record = { authenticated: false, pending: 0, lastSeen: Date.now(), alive: true, incoming: 0, inboundTail: Promise.resolve() };
        clients.set(socket, record);
        const timeout = setTimeout(() => { if (!record.authenticated) socket.close(1008, 'Authentication required'); }, config.authTimeoutMs ?? 5000);
        socket.on('error', () => {});
        socket.on('close', () => { record.alive = false; clearTimeout(timeout); clients.delete(socket); });
        const reject = () => { record.alive = false; logger.warn('Stream Avatars connection rejected'); socket.close(1008, 'Invalid message'); };
        socket.on('message', (raw, binary) => {
            try {
                if (!record.alive) return;
                if (binary) throw new Error('Invalid message');
                const message = decodeClientMessage(raw.toString());
                record.lastSeen = Date.now();
                if (!record.authenticated) {
                    const expected = Buffer.from(config.token); const provided = Buffer.from(message.token || '');
                    if (message.type !== 'auth' || expected.length !== provided.length || !timingSafeEqual(expected, provided)) throw new Error('Authentication failed');
                    record.authenticated = true; clearTimeout(timeout);
                    sendTo(socket, record, getSnapshot()); return;
                }
                if (message.type === 'auth') throw new Error('Already authenticated');
                if (record.incoming >= 32) throw new Error('Inbound queue full');
                record.incoming++;
                record.inboundTail = record.inboundTail.then(async () => {
                    if (record.alive && socket.readyState === WebSocket.OPEN) await onClientMessage(message);
                }).catch(reject).finally(() => { record.incoming--; });
            } catch { reject(); }
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
            unregister?.();
            clearInterval(heartbeat); for (const [socket, record] of clients) { record.alive = false; socket.terminate(); }
            await new Promise(resolve => wss.close(resolve));
            if (!webServer) await listener.stop();
        })();
        return stopping;
    };
    const abort = () => { void stop(); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
        unregister = listener.registerUpgrade('/sa/socket', handleUpgrade);
        if (signal?.aborted) throw new Error('Stream Avatars startup aborted');
    } catch (error) { await stop(); throw error; }
    return { address: listener.address,
        getStatus: () => ({ authenticatedClients: [...clients.values()].filter(record => record.authenticated).length }),
        disconnectClients() { for (const socket of clients.keys()) socket.terminate(); },
        send(message) { validateServerMessage(message); let delivered = false; for (const [socket, record] of clients) delivered = sendTo(socket, record, message) || delivered; return delivered; },
        stop };
}
module.exports = { startBridgeServer };
