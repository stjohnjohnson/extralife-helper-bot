const {createCelebrationComposer}=require('../src/streamAvatars/celebrations');const {validateServerMessage,publicSession}=require('../src/streamAvatars/protocol');const {createInitialState}=require('../src/broadcastSession/state');
let now,composer;beforeEach(()=>{now=1000;composer=createCelebrationComposer({clock:{nowMs:()=>now}});});
const intent=(extra={})=>({sessionId:'s',donationIds:['d'],donationCount:extra.donationIds?.length ?? 1,donationTotalCents:extra.donationIds?.length===0 ? 0 : 2500,liveTotalCents:2500,milestoneCents:null,goalReached:false,...extra});
test('ordinary five-second recognition combines nearby gifts with fixed cap',()=>{let m=composer.accept(intent());expect(m.heartsUntilMs).toBe(6000);expect(m.kind).toBe('donation');now=5000;m=composer.accept(intent());expect(m.heartsUntilMs).toBe(10000);now=9000;expect(composer.accept(intent()).heartsUntilMs).toBe(11000);});
test('milestone 18 seconds, new donations and thresholds do not extend party',()=>{let m=composer.accept(intent({milestoneCents:50000,liveTotalCents:51000}));expect(m.partyUntilMs).toBe(19000);now=3000;m=composer.accept(intent());expect(m.kind).toBe('milestone');expect(m.partyUntilMs).toBe(19000);now=4000;m=composer.accept(intent({milestoneCents:100000,liveTotalCents:110000}));expect(m.partyUntilMs).toBe(19000);expect(m.liveTotalCents).toBe(110000);});
test('goal wins and bounded upgrade does not queue parties',()=>{composer.accept(intent({milestoneCents:50000}));now=18000;let m=composer.accept(intent({goalReached:true}));expect(m.kind).toBe('goal');expect(m.partyUntilMs).toBe(38000);now=19000;m=composer.accept(intent({milestoneCents:100000}));expect(m.kind).toBe('goal');expect(m.partyUntilMs).toBe(38000);});
test('standalone goal lasts twenty seconds; session clear and stop fence state',()=>{expect(composer.accept(intent({goalReached:true})).partyUntilMs).toBe(21000);composer.clear();expect(composer.accept(intent({sessionId:'next'})).kind).toBe('donation');composer.stop();expect(composer.accept(intent())).toBeNull();});
test('public snapshots omit large donor ledger and exact v2 celebration validates',()=>{const state=createInitialState({mode:'production',channel:'test'});state.processedDonationIds=Array.from({length:10000},(_,i)=>String(i));const snapshot=publicSession(state);expect(JSON.stringify(snapshot).length).toBeLessThan(1000);expect(snapshot.processedDonationIds).toBeUndefined();const m={...composer.accept(intent()),version:2,type:'celebration',mode:'production',generation:1,id:'event'};expect(validateServerMessage(m)).toEqual(m);for(const patch of [{liveTotalCents:1.1},{caption:'execute'},{expiresAtMs:999},{partyUntilMs:1000000},{kind:'arbitrary'},{generation:-1}])expect(()=>validateServerMessage({...m,...patch})).toThrow();});

test.each([[0,'jump'],[0.499,'jump'],[0.5,'hug'],[0.999,'hug']])('recognition chooses %s as %s once per window',(draw,action)=>{
    let draws=0;const c=createCelebrationComposer({clock:{nowMs:()=>now},random:()=>{draws++;return draw;}});
    const a=c.accept(intent({donationCount:1,donationTotalCents:1000}));
    expect(a).toMatchObject({donationCount:1,donationTotalCents:1000,recognitionStartedAtMs:1000,recognitionAction:action});
    now=5000;expect(c.accept(intent({donationIds:['b'],donationCount:1,donationTotalCents:1500}))).toMatchObject({donationCount:2,donationTotalCents:2500,recognitionStartedAtMs:1000,recognitionAction:action});
    expect(draws).toBe(1);now=10001;
    expect(c.accept(intent({donationCount:1,donationTotalCents:500}))).toMatchObject({donationCount:1,donationTotalCents:500,recognitionStartedAtMs:10001});expect(draws).toBe(2);
});
test('recognition hidden totals remain hidden and clear/session reset removes old amounts',()=>{
    composer.accept(intent({donationCount:1,donationTotalCents:null}));now++;
    expect(composer.accept(intent({donationCount:1,donationTotalCents:1000})).donationTotalCents).toBeNull();
    composer.clear();expect(composer.accept(intent({donationCount:1,donationTotalCents:25})).donationTotalCents).toBe(25);
    expect(composer.accept(intent({sessionId:'new',donationCount:1,donationTotalCents:100})).donationCount).toBe(1);
});
test('goal-only recognition is empty; unsafe accumulated money is rejected without corrupting later output',()=>{
    expect(composer.accept(intent({donationIds:[],donationCount:0,donationTotalCents:0,goalReached:true}))).toMatchObject({donationCount:0,donationTotalCents:0,recognitionStartedAtMs:null,recognitionAction:null});
    composer.clear();composer.accept(intent({donationCount:1,donationTotalCents:Number.MAX_SAFE_INTEGER}));
    expect(()=>composer.accept(intent({donationCount:1,donationTotalCents:1}))).toThrow();
    expect(composer.accept(intent({donationIds:[],donationCount:0,donationTotalCents:0,goalReached:true})).donationTotalCents).toBe(Number.MAX_SAFE_INTEGER);
});
