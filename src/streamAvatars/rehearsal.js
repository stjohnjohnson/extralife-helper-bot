const { randomUUID } = require('node:crypto');
const { createInitialState } = require('../broadcastSession/state');
function parseAction(input) {
    const words = input.trim().toLowerCase().split(/\s+/); const [command, sub, arg] = words;
    const invalid = () => { throw new Error('Use !sa status, rehearsal start|stop, crowd <0-100>, hearts, clear, or session reset|recover confirm.'); };
    if (['status', 'hearts', 'clear'].includes(command) && words.length === 1) return { name: command, args: [] };
    if (command === 'rehearsal' && ['start', 'stop'].includes(sub) && words.length === 2) return { name: 'rehearsal.' + sub, args: [] };
    if (command === 'session' && ['reset', 'recover'].includes(sub) && arg === 'confirm' && words.length === 3) return { name: 'session.' + sub, args: [] };
    if (command === 'crowd' && words.length === 2 && /^\d+$/.test(sub) && Number(sub) <= 100) return { name: 'crowd.count', args: [Number(sub)] };
    invalid();
}
function createRehearsalController({ channel, productionStatus, realClock, eventDispatcher, notify, cadenceMs, standalone = false }) {
    let active = false, stopped = false;
    let state = createInitialState({ mode: 'rehearsal', channel });
    let crowdIds = [];
    const result = (status, message) => ({ status, message });
    const deactivate = () => { active = false; crowdIds = []; state = createInitialState({ mode: 'rehearsal', channel }); notify(true); };
    return {
        getStatus: () => ({ active, crowdIds: [...crowdIds], state: structuredClone(state) }),
        dispatch({ name, args = [] }) {
            if (stopped) return result('unavailable', 'Stream Avatars preview stopped.');
            if (name === 'status') return result('ok', active ? 'Rehearsal active: ' + crowdIds.length + ' avatars.' : 'Production rendering active.');
            if (name === 'clear') { crowdIds = []; notify(true); return result('ok', 'Preview effects and synthetic crowd cleared.'); }
            if (name === 'rehearsal.stop') { deactivate(); return result('ok', 'Rehearsal stopped. Restore Stream Avatars normal streaming service.'); }
            if (name === 'rehearsal.start') {
                const observation = productionStatus();
                if (!standalone && (!observation || observation.status !== 'offline' || realClock.nowMs() - observation.observedAtMs > 2 * cadenceMs)) return result('denied', 'Rehearsal requires a recent confirmed offline observation.');
                if (!active) {
                    state = { ...createInitialState({ mode: 'rehearsal', channel }), sessionId: randomUUID(), startedAtMs: realClock.nowMs() };
                    active = true; notify(true);
                }
                return result('ok', 'Rehearsal started. Use crowd <count>, hearts, or clear.');
            }
            if (!active) return result('denied', 'Start rehearsal before using crowd controls.');
            if (name === 'crowd.count' && Number.isInteger(args[0]) && args[0] >= 0 && args[0] <= 100) {
                crowdIds = Array.from({ length: args[0] }, (_, index) => 'sa_rehearsal_' + (index + 1));
                notify(false); return result('ok', 'Rehearsal crowd: ' + crowdIds.length + ' avatars.');
            }
            if (name === 'hearts') {
                const sent = eventDispatcher.publishHearts({ sessionId: state.sessionId });
                return result(sent ? 'ok' : 'unavailable', sent ? 'Heart preview sent.' : 'Stream Avatars companion unavailable; preview was not queued.');
            }
            return result('invalid', 'Unsupported preview action.');
        },
        observeProduction(observation) { if (observation.status !== 'online' || !active) return false; deactivate(); return true; },
        stop() { if (!stopped) { stopped = true; deactivate(); } }
    };
}
module.exports = { parseAction, createRehearsalController };
