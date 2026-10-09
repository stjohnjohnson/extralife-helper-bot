const { createInitialState } = require('../src/broadcastSession/state');
const { reduceDonations } = require('../src/broadcastSession/donations');
const gift=(id,cents=2500,time=150000)=>({id,participantId:'12',createdAtMs:time,amountCents:cents});
const initial=()=>({...createInitialState({mode:'production',channel:'test'}),participantId:'12',sessionId:'session',startedAtMs:100000});
const apply=(state,donations=[],extra={})=>reduceDonations(state,{scan:{complete:true,participantId:'12',fromMs:100000,throughMs:199999,donations},observedAtMs:200000,intervalCents:50000,...extra});
test('session boundary eligibility and exact cents',()=>{const s={...initial(),endedAtMs:200000};const r=apply(s,[gift('a',10,99999),gift('b',10,100000),gift('c',10,199999),gift('d',10,200000)]);expect(r.state.liveTotalCents).toBe(20);expect(r.intent).toBeNull();expect(r.state.processedDonationIds).toEqual(['b','c']);});
test('interruptions count, anonymous identity irrelevant, duplicate and out-of-order IDs once',()=>{const s={...initial(),offlineSinceMs:120000};const a=apply(s,[gift('b'),gift('a',10,110000),gift('b')]);expect(a.state.liveTotalCents).toBe(2510);expect(a.intent.donationIds).toEqual(['b','a']);expect(apply(a.state,[gift('a',10,110000),gift('b')]).intent).toBeNull();expect(apply(a.state,[gift('a',10,110000)]).state.liveTotalCents).toBe(2510);});
test('unknown amounts count recognition once, revelation money once without historical party',()=>{let r=apply(initial(),[gift('hidden',null)]);expect(r.state.unknownAmountCount).toBe(1);expect(r.intent.donationIds).toEqual(['hidden']);r=apply(r.state,[gift('hidden',60000)]);expect(r.state.liveTotalCents).toBe(60000);expect(r.state.unknownAmountCount).toBe(0);expect(r.intent).toBeNull();expect(apply(r.state,[gift('hidden',60000)]).state.liveTotalCents).toBe(60000);});
test('conflicting duplicate facts diagnose and preserve accepted money',()=>{const a=apply(initial(),[gift('a')]);const b=apply(a.state,[gift('a',5000),gift('a',2500,140000)]);expect(b.state.liveTotalCents).toBe(2500);expect(b.diagnostics).toContain('conflicting-donation');});
test('invalid normalized input and unsafe sums never mutate original',()=>{const s=initial();for(const bad of [gift('',10),gift('wrong',10),gift('neg',-1),gift('fraction',1.1)]){if(bad.id==='wrong')bad.participantId='13';expect(apply(s,[bad]).state.liveTotalCents).toBe(0);}expect(()=>apply({...s,liveTotalCents:Number.MAX_SAFE_INTEGER},[gift('overflow',1)])).toThrow();expect(s.processedDonationIds).toEqual([]);});
test('historical reconcile marks every milestone without animation',()=>{const r=apply(initial(),[gift('a',155000)],{reconcile:true});expect(r.state.reachedDonationCheckpoints).toEqual([50000,100000,150000]);expect(r.state.donationCheckpointCount).toBe(3);expect(r.intent).toBeNull();});
test('large batch produces highest new threshold and actual cumulative amount',()=>{const r=apply({...initial(),liveTotalCents:49000},[gift('a',106000)]);expect(r.intent).toMatchObject({milestoneCents:150000,liveTotalCents:155000});expect(r.state.donationCheckpointCount).toBe(3);});
test('interval changes baseline without retroactive parties; huge crossing is bounded',()=>{const s=apply(initial(),[gift('a',155000)],{reconcile:true}).state;const r=apply(s,[],{intervalCents:1});expect(r.intent).toBeNull();expect(r.state.donationCheckpointCount).toBe(155000);expect(r.state.reachedDonationCheckpoints.length).toBeLessThanOrEqual(1000);});
const campaign=(total,goal=100000,at=200000)=>({totalCents:total,goalCents:goal,observedAtMs:at});
test('goal startup already met is silent; a live rise crosses once',()=>{const met=apply(initial(),[],{campaign:campaign(100000)});expect(met.intent).toBeNull();let s=apply(initial(),[],{reconcile:true,campaign:campaign(90000)}).state;let r=apply(s,[gift('a',10000)],{campaign:campaign(100000,100000,200001)});expect(r.intent.goalReached).toBe(true);expect(apply(r.state,[gift('a',10000)],{campaign:campaign(100000,100000,200002)}).intent).toBeNull();});
test('late campaign aggregate confirms pending eligible gift; stale or expired observations cannot celebrate',()=>{let s=apply(initial(),[],{reconcile:true,campaign:campaign(90000)}).state;s=apply(s,[gift('a',10000)],{campaign:campaign(90000,100000,200001)}).state;expect(apply(s,[],{observedAtMs:250000,campaign:campaign(100000,100000,250000)}).intent.goalReached).toBe(true);expect(apply(s,[],{observedAtMs:400001,campaign:campaign(100000,100000,400001)}).intent).toBeNull();expect(apply(s,[],{campaign:campaign(100000,100000,199999)}).intent).toBeNull();});
test('lowered/changed goal, ended session and pre-stream-only gift never create bonus',()=>{const s=apply(initial(),[],{reconcile:true,campaign:campaign(90000)}).state;for(const [state,gifts,obs] of [[s,[gift('a')],campaign(90000,80000,200001)],[{...s,endedAtMs:200000},[gift('a')],campaign(100000,100000,200001)],[s,[gift('old',10000,99999)],campaign(100000,100000,200001)]])expect(apply(state,gifts,{campaign:obs}).intent?.goalReached||false).toBe(false);});
test('partial scans are not authoritative',()=>expect(()=>reduceDonations(initial(),{scan:{complete:false},intervalCents:50000,observedAtMs:200000})).toThrow());

test.each([false,true])('historical revelation does not suppress a fresh milestone, reverse=%s',reverse=>{
    const s=apply(initial(),[gift('known',49000),gift('hidden',null)],{reconcile:true}).state;
    const gifts=[gift('hidden',100),gift('new',1000)];
    const r=apply(s,reverse?gifts.reverse():gifts);
    expect(r.intent).toMatchObject({donationIds:['new'],liveTotalCents:50100,milestoneCents:50000});
    expect(r.state.donationCheckpointCount).toBe(1);
    expect(apply(r.state,gifts).intent).toBeNull();
});
test('revelation-only crossings stay silent in a mixed batch',()=>{
    const s=apply(initial(),[gift('known',49000),gift('hidden',null)],{reconcile:true}).state;
    const r=apply(s,[gift('new',1000),gift('hidden',60000)]);
    expect(r.intent).toMatchObject({donationIds:['new'],liveTotalCents:110000,milestoneCents:null});
    expect(r.state.donationCheckpointCount).toBe(2);
});
