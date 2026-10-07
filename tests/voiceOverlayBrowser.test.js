/** @jest-environment jsdom */
const { mountOverlay } = require('../src/voiceOverlay/browser');
let root; let cleanup; let sources;
class Source extends global.window.EventTarget {
    constructor() { super(); this.closed = false; sources.push(this); }
    close() { this.closed = true; }
    send(type, data) { this.dispatchEvent(new global.window.MessageEvent(type, { data: JSON.stringify(data) })); }
}
const snapshot = (revision, members) => ({ ready: true, revision, members });
const guest = (id, speaking = false) => ({ id, speaking, avatarUrl: `https://cdn.discordapp.com/avatars/${id}/x.png` });
beforeEach(() => {
    jest.useFakeTimers(); sources = [];
    global.window.EventSource = Source;
    Object.defineProperty(global.window, 'innerWidth', { value: 460, configurable: true });
    Object.defineProperty(global.window, 'innerHeight', { value: 64, configurable: true });
    global.document.body.innerHTML = '<div id="voice-overlay"></div>';
    root = global.document.getElementById('voice-overlay');
    cleanup = mountOverlay({ root, window: global.window });
});
afterEach(() => { cleanup?.(); jest.useRealTimers(); });
test('keyed nodes remain stable while simultaneous speaking classes update', () => {
    sources[0].send('snapshot', snapshot(1, [guest('one'), guest('two')]));
    const first = root.children[0];
    sources[0].send('snapshot', snapshot(2, [guest('one', true), guest('two', true)]));
    expect(root.children[0]).toBe(first);
    expect([...root.children].every(node => node.classList.contains('speaking'))).toBe(true);
    expect(root.style.getPropertyValue('--avatar-size')).toBe('48px');
    sources[0].send('snapshot', snapshot(1, [guest('late')]));
    expect(root.children).toHaveLength(2);
});
test('failed image has a fallback and departed members are removed safely', () => {
    sources[0].send('snapshot', snapshot(1, [guest('one')]));
    const img = root.querySelector('img'); img.dispatchEvent(new global.window.Event('error'));
    expect(img.hidden).toBe(true); expect(root.children[0].classList.contains('fallback')).toBe(true);
    sources[0].send('snapshot', snapshot(2, [])); expect(root.children).toHaveLength(0);
});
test('heartbeat prevents stale clearing; silence clears and reconnects after 35 seconds', () => {
    sources[0].send('snapshot', snapshot(1, [guest('one', true)]));
    jest.advanceTimersByTime(30000); sources[0].send('heartbeat', {});
    jest.advanceTimersByTime(34999); expect(root.children).toHaveLength(1);
    jest.advanceTimersByTime(1); expect(root.children).toHaveLength(0); expect(sources[0].closed).toBe(true);
    jest.advanceTimersByTime(1000); expect(sources).toHaveLength(2);
    sources[1].send('snapshot', snapshot(0, [guest('two')])); expect(root.children).toHaveLength(1);
});
test('error clears highlights, unavailable snapshots hide all members, and resize fits', () => {
    sources[0].send('snapshot', snapshot(1, Array.from({ length: 10 }, (_, i) => guest(String(i)))));
    expect(parseFloat(root.style.getPropertyValue('--avatar-size'))).toBeCloseTo(35.4);
    Object.defineProperty(global.window, 'innerWidth', { value: 540, configurable: true });
    global.window.dispatchEvent(new global.window.Event('resize'));
    expect(parseFloat(root.style.getPropertyValue('--avatar-size'))).toBeCloseTo(43.4);
    sources[0].send('snapshot', { ready: false, revision: 2, members: [] }); expect(root.children).toHaveLength(0);
    sources[0].dispatchEvent(new global.window.Event('error')); expect(root.children).toHaveLength(0);
    cleanup(); expect(jest.getTimerCount()).toBe(0);
});
test('invalid snapshots and unsafe avatar URLs do not inject content', () => {
    sources[0].send('snapshot', { revision: 'invalid', members: [] }); expect(root.children).toHaveLength(0);
    sources[0].send('snapshot', snapshot(1, [{ ...guest('<img>'), avatarUrl: 'javascript:alert(1)' }]));
    expect(root.querySelector('img').getAttribute('src')).toBeNull();
    expect(root.textContent).toBe('');
});
test('event source construction failure retries and teardown prevents later reconnects', () => {
    cleanup(); global.window.EventSource = class { constructor() { throw new Error('unavailable'); } };
    cleanup = mountOverlay({ root, window: global.window });
    jest.advanceTimersByTime(1000); expect(root.children).toHaveLength(0);
    cleanup(); jest.advanceTimersByTime(60000); expect(jest.getTimerCount()).toBe(0);
});

test('explicit preview supports 1–10 fixtures without connecting to live events', () => {
    cleanup(); global.window.history.replaceState(null, '', '/voice?preview=10');
    try {
        const oldSources = sources.length;
        cleanup = mountOverlay({ root, window: global.window });
        expect(root.children).toHaveLength(10);
        expect(sources).toHaveLength(oldSources);
        expect(root.querySelectorAll('.speaking').length).toBeGreaterThan(0);
        jest.advanceTimersByTime(1200);
        expect(root.querySelectorAll('.speaking').length).toBeGreaterThan(0);
    } finally { global.window.history.replaceState(null, '', '/voice'); }
});

test('image URL switches preserve nodes without reloading other avatars', () => {
    const idle = { ...guest('one'), avatarUrl: 'https://cdn.discordapp.com/avatars/one/a_animation.png' };
    const talking = { ...idle, speaking: true, avatarUrl: 'https://cdn.discordapp.com/avatars/one/a_animation.gif' };
    sources[0].send('snapshot', snapshot(1, [idle, guest('two')]));
    const node = root.children[0]; const image = node.firstElementChild;
    const observer = new global.window.MutationObserver(() => {});
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['src'] });
    try {
        sources[0].send('snapshot', snapshot(2, [talking, guest('two')]));
        expect(root.children[0]).toBe(node); expect(node.firstElementChild).toBe(image);
        expect(image.getAttribute('src')).toBe('https://cdn.discordapp.com/avatars/one/a_animation.gif');
        expect(node.classList.contains('speaking')).toBe(true);
        expect(observer.takeRecords().map(record => record.target)).toEqual([image]);
        sources[0].send('snapshot', snapshot(3, [talking, guest('two')]));
        expect(observer.takeRecords()).toHaveLength(0);
        sources[0].send('snapshot', snapshot(4, [idle, guest('two')]));
        expect(image.getAttribute('src')).toBe('https://cdn.discordapp.com/avatars/one/a_animation.png');
        expect(node.classList.contains('speaking')).toBe(false);
        expect(observer.takeRecords().map(record => record.target)).toEqual([image]);
    } finally { observer.disconnect(); }
});
