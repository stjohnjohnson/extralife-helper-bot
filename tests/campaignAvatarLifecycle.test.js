const fs=require('node:fs/promises');const {join}=require('node:path');const {tmpdir}=require('node:os');const {once}=require('node:events');
const WebSocket=require('ws');const {startStreamAvatars}=require('../src/streamAvatars');const {createManualClock}=require('./helpers/manualClock');
let directory,service,time,sockets,packets;
const flush=()=>new Promise(resolve=>setTimeout(resolve,5));
const campaign=(totalCents=247500)=>({totalCents,goalCents:1000000,observedAtMs:time.clock.nowMs()});
const gift=id=>({id,participantId:'12',createdAtMs:time.clock.nowMs(),amountCents:5000});
const accept=input=>service.acceptObservation({expectedEpochId:service.getPollCheckpoint()?.epochId ?? 'stopped',batchId:'batch',observedAtMs:time.clock.nowMs(),...input});
async function connect(ready=true){
    const s=new WebSocket(`ws://127.0.0.1:${service.address.port}/sa/socket`);sockets.push(s);await once(s,'open');s.on('message',r=>packets.push(JSON.parse(r)));
    const snap=once(s,'message');s.send(JSON.stringify({version:3,type:'auth',token:'t'.repeat(32)}));await snap;
    if(ready){s.send(JSON.stringify({version:3,type:'ready',capabilities:['campaign','celebrations','donation-recognition','individual-donations'],resolution:{width:1920,height:1080}}));await flush();}
    return s;
}
beforeEach(async()=>{
    directory=await fs.mkdtemp(join(tmpdir(),'sa-campaign-life-'));time=createManualClock();sockets=[];packets=[];
    service=await startStreamAvatars({config:{participantId:'12',webServer:{host:'127.0.0.1',port:0},streamAvatars:{config:{stateDir:directory,token:'t'.repeat(32),donationIntervalCents:50000}}},realClock:time.clock,timers:time.timers});
});
afterEach(async()=>{for(const s of sockets)s.terminate();await service.stop();await fs.rm(directory,{recursive:true,force:true});});
async function baseline(){await accept({donations:[],complete:true,campaign:campaign()});await time.advance(1);}
const effects=()=>packets.filter(p=>p.type==='celebration');
test('campaign intake works without a stream session and thanks precedes a milestone party',async()=>{
    expect(service.getPollCheckpoint()).toMatchObject({participantId:'12',baselineNeeded:true});expect(service.getStatus().game).toBeNull();
    const before = service.getPollCheckpoint();
    await service.observeProduction({ status: 'offline', observedAtMs: time.clock.nowMs() });
    expect(service.getPollCheckpoint()).toEqual(before);
    await baseline();await connect();await accept({donations:[gift('fresh')],campaign:campaign(252500)});await flush();
    expect(effects().map(p=>p.phase)).toEqual(['recognition']);expect(effects()[0]).toMatchObject({donationTotalCents:5000,kind:'donation'});
    await time.advance(15000);await flush();expect(effects().map(p=>p.phase)).toEqual(['recognition','party']);expect(effects()[1]).toMatchObject({campaignTotalCents:252500,kind:'milestone'});
});
test('delayed aggregate never delays thanks and confirms its party without repeating it',async()=>{
    await baseline();await connect();await accept({donations:[gift('fresh')]});await time.advance(16000);await flush();expect(effects()).toHaveLength(1);
    await accept({campaign:campaign(252500)});await flush();expect(effects().map(p=>p.phase)).toEqual(['recognition','party']);
});
test('last companion disconnect pauses queued donors and replays the active turn without cues',async()=>{
    await baseline();const s=await connect();await accept({donations:[gift('fresh')],campaign:campaign(252500)});
    await accept({batchId:'later',donations:[gift('later')]});
    const closed=once(s,'close');s.terminate();await closed;await flush();expect(time.pending.size).toBe(0);
    await time.advance(180000);packets=[];await connect();await flush();
    expect(effects()).toHaveLength(1);expect(effects()[0]).toMatchObject({replay:true,heartsUntilMs:time.clock.nowMs()+15000});
    await time.advance(15000);await flush();expect(effects()[1].kind).toBe('milestone');
    await time.advance(18000);await flush();expect(effects()[2]).toMatchObject({replay:false,phase:'recognition'});
});
test('merely authenticated companions do not consume queued turns before readiness',async()=>{
    await baseline();await connect(false);await accept({donations:[gift('waiting')]});await flush();expect(effects()).toEqual([]);
    await connect();await accept({campaign:campaign(252500)});await time.advance(15000);await flush();
    expect(effects().map(p=>p.phase)).toEqual(['recognition','party']);
});
test('one remaining ready companion retains active timing, but a late connection gets no active updates',async()=>{
    await baseline();const first=await connect();await connect();await accept({donations:[gift('fresh')],campaign:campaign(252500)});await time.advance(1000);
    const closed=once(first,'close');first.terminate();await closed;await flush();expect(time.pending.size).toBe(1);
    await time.advance(14000);await flush();expect(effects().filter(p=>p.phase==='party')).toHaveLength(1);
    await time.advance(1);const late=await connect();const lateEffects=[];late.on('message',r=>{const p=JSON.parse(r);if(p.type==='celebration')lateEffects.push(p);});
    await accept({campaign:campaign(300000)});await flush();expect(lateEffects).toEqual([]);
});
test('confirmed campaign reset needs no offline observation and fences queued timers and old intake',async()=>{
    await baseline();await connect();const epoch=service.getPollCheckpoint()?.epochId ?? 'stopped';await accept({donations:[gift('fresh')],campaign:campaign(252500)});
    expect((await service.dispatch({name:'campaign.reset'})).status).toBe('ok');expect(time.pending.size).toBe(0);
    expect((await service.acceptObservation({expectedEpochId:epoch,batchId:'old',observedAtMs:time.clock.nowMs()})).accepted).toBe(false);
    packets=[];await time.advance(30000);await flush();expect(effects()).toEqual([]);
});
test('shutdown clears the phase timer and rejects future intake',async()=>{
    await baseline();await connect();await accept({donations:[gift('fresh')],campaign:campaign(252500)});await service.stop();expect(time.pending.size).toBe(0);
    expect((await accept({donations:[gift('later')]})).accepted).toBe(false);
});
test('rejected ready client pauses the turn until a compatible reconnect',async()=>{
    await baseline();const s=await connect();await accept({donations:[gift('fresh')],campaign:campaign(252500)});
    const closed=once(s,'close');s.send(JSON.stringify({version:3,type:'command',text:'invalid'}));await closed;await flush();
    expect(time.pending.size).toBe(0);packets=[];await connect();await flush();expect(effects()[0]).toMatchObject({replay:true});
});
test('repeated readiness does not restart a turn or combine the next donor',async()=>{
    await baseline();const s=await connect();await accept({donations:[gift('first')]});await time.advance(1000);
    s.send(JSON.stringify({version:3,type:'ready',capabilities:['campaign','celebrations','donation-recognition','individual-donations'],resolution:{width:1920,height:1080}}));await flush();
    await accept({batchId:'second',donations:[gift('second')]});await flush();
    expect(effects().filter(p=>p.phase==='recognition').map(p=>p.donationCount)).toEqual([1]);await time.advance(14000);await flush();expect(effects().filter(p=>p.phase==='recognition').map(p=>p.donationCount)).toEqual([1,1]);
});
test('confirmation during recognition schedules its reward without another thank-you packet',async()=>{
    await baseline();await connect();await accept({donations:[gift('fresh')]});await accept({campaign:campaign(252500)});await flush();
    expect(effects().map(p=>p.phase)).toEqual(['recognition']);await time.advance(15000);await flush();expect(effects().map(p=>p.phase)).toEqual(['recognition','party']);
});

test('aborting a service with its own listener delivers final clear before closing sockets',async()=>{
    await service.stop();const controller=new AbortController();
    service=await startStreamAvatars({signal:controller.signal,config:{participantId:'12',webServer:{host:'127.0.0.1',port:0},streamAvatars:{config:{stateDir:directory,token:'t'.repeat(32)}}},realClock:time.clock,timers:time.timers});
    await baseline();const s=await connect();await accept({donations:[gift('signal')]});await flush();packets=[];
    const closed=once(s,'close');controller.abort();await closed;await service.stop();
    expect(packets.some(p=>p.type==='clear')).toBe(true);expect(time.pending.size).toBe(0);
});

test('goal confirmed during disconnect resumes the upgraded party for its full remaining goal time',async()=>{
    await accept({donations:[],complete:true,campaign:campaign(949000)});await time.advance(1);
    const socket=await connect();await accept({batchId:'a',donations:[gift('a')],campaign:campaign(954000)});
    await time.advance(15000);await time.advance(17000);
    const closed=once(socket,'close');socket.terminate();await closed;await flush();
    await time.advance(8000);await accept({batchId:'a',campaign:campaign(1000000)});await time.advance(1000);
    packets=[];await connect();await flush();
    expect(effects()).toHaveLength(1);expect(effects()[0]).toMatchObject({kind:'goal',replay:true,partyStartedAtMs:time.clock.nowMs(),partyUntilMs:time.clock.nowMs()+20000});
});
test('late goal is delivered after the next donor without shortening its full recognition',async()=>{
    await accept({donations:[],complete:true,campaign:campaign(949000)});await time.advance(1);await connect();
    await accept({batchId:'a',donations:[gift('a')],campaign:campaign(954000)});await time.advance(33000);
    await accept({batchId:'b',donations:[gift('b')]});await time.advance(1000);await accept({batchId:'a',campaign:campaign(1000000)});await flush();
    expect(effects().map(p=>p.kind)).toEqual(['donation','milestone','donation']);
    await time.advance(14000);await flush();expect(effects().at(-1)).toMatchObject({kind:'goal'});
    expect(effects()[2].heartsUntilMs-effects()[2].recognitionStartedAtMs).toBe(15000);
    expect(effects().at(-1).partyUntilMs-time.clock.nowMs()).toBe(5000);
});
