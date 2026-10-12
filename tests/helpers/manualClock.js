function createManualClock(initial = 10000000) {
    let now = initial, nextId = 0;
    const pending = new Map();
    const timers = { setTimeout(fn,delay) { const id=++nextId;pending.set(id,{at:now+delay,fn});return id; },clearTimeout(id) { pending.delete(id); } };
    return { clock:{nowMs:()=>now},timers,pending,
        async advance(ms) {
            const target=now+ms;
            while (true) {
                const entry=[...pending.entries()].filter(([,v])=>v.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];
                if(!entry)break;now=entry[1].at;pending.delete(entry[0]);entry[1].fn();await new Promise(resolve=>setImmediate(resolve));
            }
            now=target;await new Promise(resolve=>setImmediate(resolve));
        }
    };
}
module.exports={createManualClock};
