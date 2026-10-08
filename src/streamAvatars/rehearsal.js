function parseAction(input) {
    const words = input.trim().toLowerCase().split(/\s+/); const [command, sub, arg] = words;
    const invalid = () => { throw new Error('Use !sa status, rehearsal start|stop|reset, crowd <0-100>, hearts, clock advance|seek <duration>, scenario <name>, hue on|off, or session reset|recover confirm.'); };
    if (command === 'status' && words.length === 1) return { name: 'status', args: [] };
    if (command === 'hearts' && words.length === 1) return { name: 'hearts', args: [] };
    if (command === 'rehearsal' && ['start', 'stop', 'reset'].includes(sub) && words.length === 2) return { name: 'rehearsal.' + sub, args: [] };
    if (command === 'session' && ['reset', 'recover'].includes(sub) && arg === 'confirm' && words.length === 3) return { name: 'session.' + sub, args: [] };
    if (command === 'crowd') {
        const text = words.length === 2 ? sub : arg;
        if (!/^\d+$/.test(text || '')) invalid();
        const count = Number(text); const kind = words.length === 2 ? 'count' : sub;
        if (!['count', 'join', 'leave'].includes(kind) || words.length > 3 || count > 100 || count < (kind === 'count' ? 0 : 1)) invalid();
        return { name: 'crowd.' + kind, args: [count] };
    }
    if (command === 'clock' && ['advance', 'seek'].includes(sub) && words.length === 3) {
        const match = arg.match(/^(\d+)(s|m|h)$/); if (!match) invalid();
        const duration = Number(match[1]) * { s: 1000, m: 60000, h: 3600000 }[match[2]];
        if (!Number.isSafeInteger(duration) || duration > 172800000) invalid();
        return { name: 'clock.' + sub, args: [duration] };
    }
    if (command === 'scenario' && /^[a-z][a-z0-9-]{0,31}$/.test(sub || '')) return { name: 'scenario', args: [sub, words.slice(2)] };
    if (command === 'hue' && ['on', 'off'].includes(sub) && words.length === 2) return { name: 'hue', args: [sub === 'on'] };
    invalid();
}
function createScenarioRegistry() {
    const scenarios = new Map();
    return {
        registerScenario({ name, parseArgs, run }) {
            if (!/^[a-z][a-z0-9-]{0,31}$/.test(name) || scenarios.has(name) || typeof parseArgs !== 'function' || typeof run !== 'function') throw new Error('Invalid scenario registration');
            scenarios.set(name, { parseArgs, run }); return () => scenarios.delete(name);
        },
        async run(name, args, context) {
            const scenario = scenarios.get(name);
            if (!scenario) throw Object.assign(new Error('Scenario unavailable.'), { status: 'unavailable' });
            return scenario.run(scenario.parseArgs(args), context);
        }
    };
}
async function createRehearsalController({ createSession, productionStatus, clock, realClock, bridge, eventDispatcher, hue, registry = createScenarioRegistry(), notify, graceMs, cadenceMs, standalone = false }) {
    let session = await createSession(); let unsubscribe = session.subscribe(() => notify(false));
    let active = false; let stopped = false; let hueEnabled = false; let hueAbort = null; let epoch = 0; let tail = Promise.resolve();
    const crowd = new Set();
    const restored = session.getSnapshot();
    if (restored.latestObservation) clock.seek(restored.latestObservation.observedAtMs);
    const result = (status, message) => ({ status, message });
    const getStatus = () => ({ active, crowdIds: [...crowd].sort(), hueEnabled, state: session.getSnapshot(), nowMs: clock.nowMs(), recoveryRequired: session.getStatus().recoveryRequired });
    const cancelHue = () => { hueEnabled = false; hueAbort?.abort(); hueAbort = null; };
    const deactivate = () => { epoch++; active = false; cancelHue(); crowd.clear(); notify(true); };
    const online = async (streamId = 'rehearsal-stream', start = session.getSnapshot().startedAtMs ?? clock.nowMs()) => {
        await session.observe({ status: 'online', observedAtMs: clock.nowMs(), startedAtMs: start, streamId });
    };
    const advanceSample = async (status, amount) => { clock.advance(amount); await session.observe({ status, observedAtMs: clock.nowMs() }); };
    const noArgs = args => { if (args.length) throw new Error('This scenario takes no arguments.'); return args; };
    for (const [name, run] of [
        ['reconnect', async () => { await advanceSample('offline', 1); clock.advance(cadenceMs); await online('reconnected'); bridge.disconnectClients(); }],
        ['changed-stream', async () => { clock.advance(1); await online('changed-id', clock.nowMs()); }],
        ['api-error', async () => { await advanceSample('unknown', 1); }],
        ['sustained-offline', async () => {
            await advanceSample('offline', 1);
            const step = Math.min(cadenceMs, graceMs);
            for (let duration = 0; duration <= graceMs; duration += step) await advanceSample('offline', step);
            clock.advance(1); await online('new-stream', clock.nowMs());
        }],
        ['restart', async () => { unsubscribe(); await session.stop(); session = await createSession(); unsubscribe = session.subscribe(() => notify(false)); }]
    ]) registry.registerScenario({ name, parseArgs: noArgs, run });
    async function execute(action, admittedEpoch) {
        if (stopped || admittedEpoch !== epoch) return result('unavailable', 'Rehearsal action cancelled.');
        const { name, args = [] } = action;
        if (name === 'status') return result('ok', active ? 'Rehearsal active: ' + crowd.size + ' avatars.' : 'Production rendering active.');
        if (name === 'rehearsal.stop') { deactivate(); return result('ok', 'Rehearsal stopped. Restore Stream Avatars normal streaming service.'); }
        if (name === 'rehearsal.start') {
            const observation = productionStatus();
            if (!standalone && (!observation || observation.status !== 'offline' || realClock.nowMs() - observation.observedAtMs > 2 * cadenceMs)) return result('denied', 'Rehearsal requires a recent confirmed offline observation.');
            if (session.getStatus().recoveryRequired) return result('unavailable', 'Rehearsal state needs reset or recovery.');
            if (!session.getSnapshot().sessionId || session.getSnapshot().endedAtMs !== null) { clock.advance(1); await online(); }
            if (admittedEpoch !== epoch || stopped) return result('unavailable', 'Rehearsal action cancelled.');
            active = true; notify(true); return result('ok', 'Rehearsal started. Use !sa crowd <count> and !sa hearts.');
        }
        if (name === 'rehearsal.reset') { cancelHue(); await session.reset(); crowd.clear(); if (active) { clock.advance(1); await online(); } notify(true); return result('ok', 'Rehearsal state reset.'); }
        if (!active) return result('denied', 'Start rehearsal before using simulated controls.');
        if (name.startsWith('crowd.')) {
            const id = 'sa_rehearsal_' + args[0];
            if (name === 'crowd.count') { crowd.clear(); for (let index = 1; index <= args[0]; index++) crowd.add('sa_rehearsal_' + index); }
            else if (name === 'crowd.join') crowd.add(id); else crowd.delete(id);
            notify(false); return result('ok', 'Rehearsal crowd: ' + crowd.size + ' avatars.');
        }
        if (name === 'clock.advance') { clock.advance(args[0]); await session.rebaseRehearsalClock(clock.nowMs()); notify(false); return result('ok', 'Rehearsal clock advanced.'); }
        if (name === 'clock.seek') { clock.seek((session.getSnapshot().startedAtMs ?? clock.nowMs()) + args[0]); await session.rebaseRehearsalClock(clock.nowMs()); notify(true); return result('ok', 'Rehearsal clock set; historical checkpoints will not replay.'); }
        if (name === 'hue') {
            if (args[0] && !hue?.()) return result('unavailable', 'Hue is unavailable.');
            hueEnabled = args[0]; return result('ok', 'Rehearsal Hue output ' + (hueEnabled ? 'enabled.' : 'disabled.'));
        }
        if (name === 'hearts') {
            if (session.getStatus().recoveryRequired) return result('unavailable', 'Rehearsal state requires recovery.');
            const sent = eventDispatcher.publishHearts({ sessionId: session.getSnapshot().sessionId });
            if (sent && hueEnabled) {
                if (!hueAbort || hueAbort.signal.aborted) hueAbort = new AbortController();
                await hue().celebrateDonation({ signal: hueAbort.signal });
            }
            return result(sent ? 'ok' : 'unavailable', sent ? 'Heart preview sent.' : 'Stream Avatars companion is unavailable; effects were not queued.');
        }
        if (name === 'scenario') { await registry.run(args[0], args[1], { session, clock, eventDispatcher }); if (admittedEpoch === epoch) notify(true); return result('ok', 'Rehearsal scenario ' + args[0] + ' complete.'); }
        return result('invalid', 'Unsupported rehearsal action.');
    }
    return { getStatus,
        dispatch(action) {
            // Cancel immediately even when an earlier preview is awaiting bridge reads.
            if (['rehearsal.stop', 'rehearsal.reset'].includes(action.name) || (action.name === 'hue' && !action.args[0])) cancelHue();
            const admittedEpoch = epoch;
            const operation = tail.then(() => execute(action, admittedEpoch)).catch(error => result(error.status || 'unavailable', error.status ? error.message : 'Rehearsal action failed; check state and companion setup.'));
            tail = operation.then(() => {}); return operation;
        },
        observeProduction(observation) {
            if (observation.status !== 'online') return false;
            const wasActive = active; epoch++; active = false; cancelHue(); crowd.clear();
            if (wasActive) notify(true);
            return wasActive;
        },
        registerScenario: registry.registerScenario,
        async stop() { stopped = true; deactivate(); await tail; unsubscribe(); await session.stop(); }
    };
}
module.exports = { parseAction, createScenarioRegistry, createRehearsalController };
