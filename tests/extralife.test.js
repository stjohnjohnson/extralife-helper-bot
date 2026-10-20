const { getUserInfo } = require('../src/extralife');

let fetch;
beforeEach(() => { fetch = jest.spyOn(globalThis, 'fetch'); });
afterEach(() => { jest.restoreAllMocks(); });

test('reads participant information directly from the current host', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({
        participantID: 12, displayName: 'Player', sumDonations: 1250.5, fundraisingGoal: 10000
    })));
    await expect(getUserInfo(12)).resolves.toMatchObject({
        displayName: 'Player', sumDonations: 1250.5, fundraisingGoal: 10000
    });
    expect(fetch).toHaveBeenCalledWith('https://dd.extra-life.org/api/participants/12?version=1.4',
        expect.objectContaining({ signal: expect.any(AbortSignal) }));
});

test('encodes participant identifiers without adding query parameters', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ displayName: 'Player' })));
    await getUserInfo('12/34?other=1');
    expect(fetch.mock.calls[0][0]).toBe('https://dd.extra-life.org/api/participants/12%2F34%3Fother%3D1?version=1.4');
});

test.each([204, 304, 404, 412, 429, 500])('rejects participant HTTP status %i', async status => {
    fetch.mockResolvedValue(new Response(null, { status }));
    await expect(getUserInfo(12)).rejects.toThrow('Extra Life API status ' + status);
});

test.each([null, [], 'not a participant'])('rejects invalid participant response %j', async data => {
    fetch.mockResolvedValue(new Response(JSON.stringify(data)));
    await expect(getUserInfo(12)).rejects.toThrow('Invalid Extra Life participant response');
});

test('rejects malformed participant JSON', async () => {
    fetch.mockResolvedValue(new Response('<html>Unavailable</html>'));
    await expect(getUserInfo(12)).rejects.toMatchObject({ name: 'SyntaxError' });
});

test('preserves network errors', async () => {
    const error = new Error('network unavailable');
    fetch.mockRejectedValue(error);
    await expect(getUserInfo(12)).rejects.toBe(error);
});

test('aborts a participant request after ten seconds', async () => {
    let timer;
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
        const controller = new AbortController();
        timer = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms);
        return controller.signal;
    });
    jest.useFakeTimers();
    try {
        fetch.mockImplementation((url, { signal }) => new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }));
        const result = getUserInfo(12);
        const rejected = expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
        await jest.advanceTimersByTimeAsync(9999);
        expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
        await jest.advanceTimersByTimeAsync(1);
        await rejected;
        expect(timeout).toHaveBeenCalledWith(10000);
    } finally {
        clearTimeout(timer);
        jest.useRealTimers();
    }
});
