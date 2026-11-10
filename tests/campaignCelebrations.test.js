const { createCampaignCelebrationComposer } = require('../src/streamAvatars/celebrations');
let now, c, sequence, draws;
const gift = (batchId='a',patch={}) => {
    const value={batchId,donationIds:[batchId],donationCount:1,donationTotalCents:5000,campaignTotalCents:252500,milestoneCents:null,goalReached:false,...patch};
    return {...value,donations:value.donations ?? value.donationIds.map(id=>({id,participantId:'12',createdAtMs:1000,amountCents:value.donationTotalCents,displayName:id.toUpperCase()}))};
};
const reward=(batchId='a',patch={})=>gift(batchId,{donationIds:[],donations:[],donationCount:0,donationTotalCents:0,milestoneCents:250000,...patch});
beforeEach(()=>{now=1000;sequence=0;draws=0;c=createCampaignCelebrationComposer({clock:{nowMs:()=>now},random:()=>{draws++;return 0.5;},newSequenceId:()=>String(++sequence)});});
test('donor turns remain separate for fifteen seconds without extending the current donor',()=>{
    const first=c.accept(gift())[0];now=5000;expect(c.accept(gift('b',{donationTotalCents:2500}))).toEqual([]);
    expect(first).toMatchObject({donorName:'A',donationCount:1,donationTotalCents:5000,heartsUntilMs:16000,replay:false});
    now=15999;expect(c.advance()).toEqual([]);now=16000;
    expect(c.advance()[0]).toMatchObject({donorName:'B',donationCount:1,donationTotalCents:2500,heartsUntilMs:31000});
    now=31000;expect(c.advance()).toEqual([]);expect(c.nextTransitionAt()).toBeNull();expect(draws).toBe(2);
});
test('every donor and attached reward survive a backlog beyond two minutes',()=>{
    for(let i=0;i<10;i++) c.accept(gift('d'+i,i===9?{milestoneCents:250000}:{}));
    for(let i=1;i<10;i++){now=1000+i*15000;expect(c.advance()[0]).toMatchObject({donorName:'D'+i,heartsUntilMs:now+15000});}
    now=151000;expect(c.advance()[0]).toMatchObject({kind:'milestone',partyUntilMs:169000});
});
test('a batch reward follows the last individual donor',()=>{
    const donations=[{id:'a',displayName:'ALICE',amountCents:1000},{id:'b',displayName:'BOB',amountCents:1500}];
    expect(c.accept(gift('batch',{donationIds:['a','b'],donations,donationCount:2,donationTotalCents:2500,milestoneCents:250000}))[0].donorName).toBe('ALICE');
    now=16000;expect(c.advance()[0].donorName).toBe('BOB');now=31000;expect(c.advance()[0]).toMatchObject({kind:'milestone',donorName:null,partyUntilMs:49000});
});
test('donations during parties wait for the party and retain their own amounts',()=>{
    c.accept(gift('a',{milestoneCents:250000}));now=16000;c.advance();now=17000;
    c.accept(gift('b',{donationTotalCents:null}));c.accept(gift('c',{donationTotalCents:1000}));
    now=34000;expect(c.advance()[0]).toMatchObject({donorName:'B',donationTotalCents:null});
    now=49000;expect(c.advance()[0]).toMatchObject({donorName:'C',donationTotalCents:1000});
});
test('goal wins a simultaneous milestone and lasts twenty seconds',()=>{
    c.accept(gift('a',{milestoneCents:250000,goalReached:true}));now=16000;
    expect(c.advance()[0]).toMatchObject({kind:'goal',partyUntilMs:36000});now=36000;expect(c.advance()).toEqual([]);expect(c.nextTransitionAt()).toBeNull();
});
test('late confirmation starts a party without repeating thanks or randomness',()=>{
    c.accept(gift());now=16000;c.advance();now=20000;
    expect(c.accept(reward())[0]).toMatchObject({phase:'party',partyUntilMs:38000});expect(draws).toBe(1);expect(c.accept(reward())).toEqual([]);
});
test('late rewards wait for the active donor and precede the next waiting donor',()=>{
    c.accept(gift());now=16000;c.advance();now=17000;c.accept(gift('b'));c.accept(gift('c'));now=18000;
    expect(c.accept(reward())).toEqual([]);now=32000;expect(c.advance()[0].kind).toBe('milestone');
    now=50000;expect(c.advance()[0].donorName).toBe('C');
});
test('late rewards during another party queue no fabricated donation caption',()=>{
    c.accept(gift());now=16000;c.advance();now=17000;c.accept(gift('b',{milestoneCents:250000}));now=32000;c.advance();
    expect(c.accept(reward())).toEqual([]);now=50000;expect(c.advance()[0]).toMatchObject({phase:'party',donationCount:0,recognitionAction:null});
});
test('same-batch confirmations attach to the batch tail across incremental pages',()=>{
    c.accept(gift('batch',{donationIds:['a']}));c.accept(gift('batch',{donationIds:['b']}));c.accept(reward('batch'));
    now=16000;expect(c.advance()[0].donorName).toBe('B');now=31000;expect(c.advance()[0].kind).toBe('milestone');
});
test('goal upgrade keeps party identity and the original thirty-eight-second cap',()=>{
    c.accept(gift('a',{milestoneCents:250000}));now=16000;const first=c.advance()[0];now=33000;
    expect(c.accept(reward('a',{goalReached:true}))[0]).toMatchObject({sequenceId:first.sequenceId,kind:'goal',partyStartedAtMs:16000,partyUntilMs:53000});
    now=52000;expect(c.accept(reward('a',{goalReached:true}))).toEqual([]);expect(c.nextTransitionAt()).toBe(53000);
});
test('fresh batch goal cannot upgrade an older party before its donor turn',()=>{
    c.accept(gift('a',{milestoneCents:250000}));now=16000;c.advance();now=17000;expect(c.accept(gift('b',{goalReached:true}))).toEqual([]);
    now=34000;expect(c.advance()[0].donorName).toBe('B');now=49000;expect(c.advance()[0]).toMatchObject({kind:'goal',partyUntilMs:69000});
});
function completedMilestone(){c.accept(gift());now=16000;c.advance();now=20000;const first=c.accept(reward())[0];now=38000;c.advance();return first;}
test('late goal upgrade can resume only within the original party bound',()=>{
    const first=completedMilestone();now=46000;expect(c.accept(reward('a',{goalReached:true}))[0]).toMatchObject({sequenceId:first.sequenceId,kind:'goal',partyStartedAtMs:20000,partyUntilMs:58000});
    now=58000;c.advance();expect(c.accept(reward('a',{goalReached:true}))).toEqual([]);
});
test.each(['expired','recognition','party'])('completed goal waits for newer %s without escaping its original bound',kind=>{
    completedMilestone();now=kind==='expired'?59000:39000;
    if(kind!=='expired')c.accept(gift('b',kind==='party'?{milestoneCents:300000,campaignTotalCents:305000}:{}));
    if(kind==='party'){now=54000;c.advance();}
    const deadline=c.nextTransitionAt();expect(c.accept(reward('a',{goalReached:true}))).toEqual([]);expect(c.nextTransitionAt()).toBe(deadline);
    if(kind==='recognition'){now=54000;expect(c.advance()[0]).toMatchObject({kind:'goal',partyUntilMs:58000});}
    if(kind==='party'){now=72000;expect(c.advance()).toEqual([]);expect(c.nextTransitionAt()).toBeNull();}
});
test('expired completed batches cannot revive but stalled queued work is retained',()=>{
    c.accept(gift());now=16000;c.advance();now=121001;expect(c.accept(reward())).toEqual([]);
    c.accept(gift('next',{milestoneCents:250000}));now=300000;expect(c.advance()[0].kind).toBe('milestone');
});
test('duplicate IDs cannot add money or change the deadline',()=>{
    c.accept(gift());now=3000;expect(c.accept(gift())).toEqual([]);expect(c.nextTransitionAt()).toBe(16000);
});
test('partial duplicated intents fail transactionally without consuming the fresh ID',()=>{
    c.accept(gift());const mixed=gift('mix',{donationIds:['a','b'],donationCount:2,donationTotalCents:10000,donations:[{id:'a',displayName:'A',amountCents:5000},{id:'b',displayName:'B',amountCents:5000}]});
    expect(()=>c.accept(mixed)).toThrow();expect(c.nextTransitionAt()).toBe(16000);c.accept(gift('b'));now=16000;expect(c.advance()[0].donorName).toBe('B');
});
test('unsafe aggregates and mismatched individual facts reject before state changes',()=>{
    c.accept(gift());expect(()=>c.accept(gift('bad',{donationIds:['b','c'],donationCount:2,donationTotalCents:Number.MAX_SAFE_INTEGER,donations:[{id:'b',displayName:'B',amountCents:Number.MAX_SAFE_INTEGER},{id:'c',displayName:'C',amountCents:1}]}))).toThrow();
    expect(()=>c.accept(gift('bad',{donations:[{id:'bad',displayName:'BAD',amountCents:1}]}))).toThrow();expect(c.nextTransitionAt()).toBe(16000);
});
test('pause preserves full donor turns without reusing old timestamps or cues',()=>{
    const first=c.accept(gift())[0];c.accept(gift('b'));now=6000;c.pause();now=300000;
    expect(c.advance()).toEqual([]);expect(c.nextTransitionAt()).toBeNull();
    expect(c.resume()[0]).toMatchObject({sequenceId:first.sequenceId,donorName:'A',recognitionStartedAtMs:300000,heartsUntilMs:315000,replay:true});
    expect(draws).toBe(1);expect(c.resume()).toEqual([]);now=315000;expect(c.advance()[0]).toMatchObject({donorName:'B',replay:false});
});
test('paused admission waits for readiness without consuming randomness',()=>{
    c.pause();expect(c.accept(gift())).toEqual([]);expect(draws).toBe(0);now=300000;expect(c.resume()[0]).toMatchObject({donorName:'A',replay:false,heartsUntilMs:315000});
});
test('party reconnect resumes remaining duration without repeating actions',()=>{
    c.accept(gift('a',{milestoneCents:250000}));now=16000;c.advance();now=20000;c.pause();now=300000;
    expect(c.resume()[0]).toMatchObject({kind:'milestone',partyStartedAtMs:300000,partyUntilMs:314000,replay:true});
});
test('clear and stop discard active, queued, and pending reward work',()=>{
    c.accept(gift());c.accept(gift('b'));c.clear();expect(c.advance()).toEqual([]);expect(c.nextTransitionAt()).toBeNull();
    expect(c.accept(reward())).toEqual([]);c.stop();expect(c.accept(gift('new'))).toEqual([]);
});
test.each([0,0.499,0.5,0.999])('one draw %s selects each new donor action',draw=>{
    c=createCampaignCelebrationComposer({clock:{nowMs:()=>now},random:()=>draw});expect(c.accept(gift())[0].recognitionAction).toBe(draw<0.5?'jump':'hug');
});
test.each([-1,1,NaN])('invalid draw %s cannot corrupt the queue',draw=>{
    c=createCampaignCelebrationComposer({clock:{nowMs:()=>now},random:()=>draw});expect(()=>c.accept(gift())).toThrow();expect(c.nextTransitionAt()).toBeNull();
});
test.each([{donationCount:2},{donationTotalCents:-1},{campaignTotalCents:1.5},{milestoneCents:300000},{goalReached:'yes'},{donations:[{id:'a',displayName:'lower',amountCents:5000}]}])('invalid intent %j leaves no effects',patch=>{
    expect(()=>c.accept(gift('a',patch))).toThrow();expect(c.nextTransitionAt()).toBeNull();
});

test('late goal follows the current full donor before its original upgrade deadline',()=>{
    now=0;c.accept(gift('a',{milestoneCents:250000}));now=15000;c.advance();now=33000;c.advance();c.accept(gift('b'));
    now=34000;expect(c.accept(reward('a',{goalReached:true}))).toEqual([]);
    expect(c.nextTransitionAt()).toBe(48000);now=48000;
    expect(c.advance()[0]).toMatchObject({kind:'goal',partyStartedAtMs:15000,partyUntilMs:53000});
    now=53000;expect(c.advance()).toEqual([]);
});
test('completed goal upgrade waits through a pause and uses a fresh delivery epoch',()=>{
    now=0;c.accept(gift('a',{milestoneCents:250000}));now=15000;c.advance();now=33000;c.advance();c.pause();
    now=34000;expect(c.accept(reward('a',{goalReached:true}))).toEqual([]);now=35000;
    expect(c.resume()[0]).toMatchObject({kind:'goal',partyStartedAtMs:35000,partyUntilMs:53000,replay:true});
});
test('goal confirmation during a paused milestone updates its saved duration and cap',()=>{
    now=0;c.accept(gift('a',{milestoneCents:250000}));now=15000;c.advance();now=32000;c.pause();
    now=40000;expect(c.accept(reward('a',{goalReached:true}))).toEqual([]);now=41000;
    expect(c.resume()[0]).toMatchObject({kind:'goal',partyStartedAtMs:41000,partyUntilMs:61000,replay:true});
    now=61000;expect(c.advance()).toEqual([]);expect(c.nextTransitionAt()).toBeNull();
});
test('an expired completed goal upgrade cannot block the next queued donor after reconnect',()=>{
    now=0;c.accept(gift('a',{milestoneCents:250000}));now=15000;c.advance();now=33000;c.advance();c.pause();now=34000;
    c.accept(reward('a',{goalReached:true}));c.accept(gift('b'));now=60000;
    expect(c.resume()[0]).toMatchObject({donorName:'B',phase:'recognition',replay:false,heartsUntilMs:75000});
});
