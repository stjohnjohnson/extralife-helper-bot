function calculateLayout({ width, height, count }) {
    if (count < 1 || width <= 0 || height <= 0) return { diameter: 0, gap: 0, ring: 0 };
    const available = Math.max(0, width - 10);
    const vertical = Math.max(0, height - 10);
    let ring = Math.min(3, vertical / 2);
    let gap = 8;
    let diameter = Math.max(0, Math.min(48, vertical - ring * 2));
    if (count * (diameter + ring * 2) + (count - 1) * gap > available) {
        gap = count > 1 ? Math.max(4, Math.min(8, (available - count * (diameter + ring * 2)) / (count - 1))) : 0;
        const minimum = count * ring * 2 + (count - 1) * gap;
        if (minimum > available) { const factor = available / minimum; ring *= factor; gap *= factor; }
        diameter = Math.max(0, Math.min(diameter, (available - (count - 1) * gap) / count - ring * 2));
    }
    return { diameter, gap, ring };
}

function mountOverlay({ root, window }) {
    const nodes = new Map();
    let members = [];
    let source;
    let revision = -1;
    let active = true;
    let attempts = 0;
    let reconnectTimer;
    let staleTimer;
    function resize() {
        const layout = calculateLayout({ width: window.innerWidth, height: window.innerHeight, count: members.length });
        root.style.setProperty('--avatar-size', `${layout.diameter}px`);
        root.style.setProperty('--avatar-gap', `${layout.gap}px`);
        root.style.setProperty('--avatar-ring', `${layout.ring}px`);
    }
    function clear() { root.replaceChildren(); nodes.clear(); members = []; resize(); }
    function touch() {
        window.clearTimeout(staleTimer);
        staleTimer = window.setTimeout(reconnect, 35000);
    }
    function render(snapshot) {
        if (!snapshot || typeof snapshot.ready !== 'boolean' || !Number.isInteger(snapshot.revision) || !Array.isArray(snapshot.members)) return;
        if (snapshot.revision < revision) return;
        if (!snapshot.members.every(member => member && typeof member.id === 'string' && typeof member.avatarUrl === 'string' && typeof member.speaking === 'boolean')) return;
        revision = snapshot.revision;
        members = snapshot.ready ? snapshot.members : [];
        const retained = new Set(members.map(member => member.id));
        for (const [id, node] of nodes) if (!retained.has(id)) { node.remove(); nodes.delete(id); }
        for (const member of members) {
            let node = nodes.get(member.id);
            if (!node) {
                node = root.ownerDocument.createElement('div'); node.className = 'avatar'; node.setAttribute('role', 'img');
                const image = root.ownerDocument.createElement('img'); image.alt = ''; image.draggable = false;
                image.addEventListener('error', () => { image.hidden = true; node.classList.add('fallback'); });
                node.append(image); nodes.set(member.id, node);
            }
            const image = node.firstElementChild;
            const safeUrl = /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\//.test(member.avatarUrl) ? member.avatarUrl : null;
            if (safeUrl !== image.getAttribute('src')) {
                node.classList.remove('fallback'); image.hidden = false;
                if (safeUrl) image.src = safeUrl;
                else { image.removeAttribute('src'); image.hidden = true; node.classList.add('fallback'); }
            }
            node.classList.toggle('speaking', member.speaking);
            node.setAttribute('aria-label', member.speaking ? 'Voice participant speaking' : 'Voice participant');
            root.append(node);
        }
        resize();
    }
    function reconnect() {
        if (!active || reconnectTimer) return;
        source?.close(); window.clearTimeout(staleTimer); clear();
        reconnectTimer = window.setTimeout(() => { reconnectTimer = null; connect(); }, Math.min(1000 * 2 ** Math.min(attempts++, 5), 30000));
    }
    function connect() {
        if (!active) return;
        revision = -1;
        try {
            source = new window.EventSource('/voice/events');
            const current = source;
            source.addEventListener('snapshot', event => {
                if (!active || source !== current || reconnectTimer) return;
                try { render(JSON.parse(event.data)); touch(); attempts = 0; } catch { reconnect(); }
            });
            source.addEventListener('heartbeat', () => { if (active && source === current && !reconnectTimer) touch(); });
            source.addEventListener('error', reconnect);
            touch();
        } catch { reconnect(); }
    }
    let previewTimer;
    const preview = new window.URLSearchParams(window.location.search).get('preview');
    window.addEventListener('resize', resize);
    if (/^(?:[1-9]|10)$/.test(preview || '')) {
        let tick = 0;
        const drawPreview = () => {
            const count = Number(preview);
            render({ ready: true, revision: tick, members: Array.from({ length: count }, (_, i) => ({
                id: String(i), avatarUrl: `https://cdn.discordapp.com/embed/avatars/${i % 6}.png`,
                speaking: i === tick % count || i === (tick + 1) % count
            })) });
            tick++;
        };
        drawPreview(); previewTimer = window.setInterval(drawPreview, 1200);
    } else { resize(); connect(); }
    return () => {
        if (!active) return;
        active = false; source?.close();
        window.clearTimeout(staleTimer); window.clearTimeout(reconnectTimer); window.clearInterval(previewTimer);
        window.removeEventListener('resize', resize); clear();
    };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { calculateLayout, mountOverlay };
else mountOverlay({ root: document.getElementById('voice-overlay'), window });
