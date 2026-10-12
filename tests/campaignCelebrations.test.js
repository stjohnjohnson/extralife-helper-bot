const { createCampaignCelebrationComposer } = require('../src/streamAvatars/celebrations');
let now, c, sequence, draws;
const gift = (batchId='a',patch={}) => ({batchId,donationIds:[batchId],donationCount:1,donationTotalCents:5000,campaignTotalCents:252500,milestoneCents:null,goalReached:false,...patch});
const reward = (batchId='a',patch={}) => gift(batchId,{donationIds:[],donationCount:0,donationTotalCents:0,milestoneCents:250000,...patch});
beforeEach(()=>{now=1000;sequence=0;draws=0;c=createCampaignCelebrationComposer({clock:{nowMs:()=>now},random:()=>{draws++;return 0.5;},newSequenceId:()=>String(++sequence)});});
test('thanks precedes the milestone party; fresh gifts during a party wait their turn',()=>{
    expect(c.accept(gift('a',{milestoneCents:250000}))[0]).toMatchObject({phase:'recognition',kind:'donation',heartsUntilMs:6000,partyUntilMs:0});
    now=5999;expect(c.advance()).toEqual([]);expect(c.nextTransitionAt()).toBe(6000);
    now=6000;expect(c.advance()[0]).toMatchObject({phase:'party',kind:'milestone',partyStartedAtMs:6000,partyUntilMs:24000,donationCount:0});
    now=10000;expect(c.accept(gift('b'))).toEqual([]);
    now=24000;expect(c.advance()[0]).toMatchObject({phase:'recognition',donationCount:1,heartsUntilMs:29000});
});
test('nearby gifts combine amounts with a ten-second cap and one action draw',()=>{
    const first=c.accept(gift())[0];now=5000;let m=c.accept(gift('b',{donationTotalCents:2500}))[0];
    expect(m).toMatchObject({donationCount:2,donationTotalCents:7500,heartsUntilMs:10000,recognitionAction:'hug',sequenceId:first.sequenceId});
    now=9000;m=c.accept(gift('c'))[0];expect(m.heartsUntilMs).toBe(11000);expect(draws).toBe(1);
    now=11000;expect(c.advance()).toEqual([]);expect(c.nextTransitionAt()).toBeNull();
});
test('goal wins a simultaneous milestone and lasts twenty seconds',()=>{
    c.accept(gift('a',{milestoneCents:250000,goalReached:true}));now=6000;
    expect(c.advance()[0]).toMatchObject({kind:'goal',partyUntilMs:26000});
    now=26000;expect(c.advance()).toEqual([]);expect(c.nextTransitionAt()).toBeNull();
});
test('one pending batch combines gifts and keeps the highest reward',()=>{
    c.accept(gift('a',{milestoneCents:250000}));now=6000;c.advance();
    now=7000;c.accept(gift('b',{milestoneCents:300000,campaignTotalCents:305000}));
    now=8000;c.accept(gift('c',{milestoneCents:350000,campaignTotalCents:355000}));
    now=24000;expect(c.advance()[0]).toMatchObject({donationCount:2,donationTotalCents:10000,heartsUntilMs:29000});
    now=29000;expect(c.advance()[0]).toMatchObject({milestoneCents:350000,campaignTotalCents:355000,partyUntilMs:47000});
    now=47000;expect(c.advance()).toEqual([]);
});
test('late total confirmation starts the party without repeating thanks',()=>{
    c.accept(gift());now=6000;expect(c.advance()).toEqual([]);now=16000;
    expect(c.accept(reward())[0]).toMatchObject({phase:'party',partyStartedAtMs:16000,partyUntilMs:34000});expect(draws).toBe(1);
    expect(c.accept(reward())).toEqual([]);
});
test('an expired or cleared batch cannot be revived by delayed metadata',()=>{
    c.accept(gift());now=121001;expect(c.accept(reward())).toEqual([]);
    c.clear();expect(c.accept(reward())).toEqual([]);c.stop();expect(c.accept(gift('new'))).toEqual([]);
});
test('same-batch goal upgrade preserves sequence/action identity and the 38-second party cap',()=>{
    c.accept(gift('a',{milestoneCents:250000}));now=6000;const party=c.advance()[0];now=23000;
    expect(c.accept(reward('a',{goalReached:true}))[0]).toMatchObject({sequenceId:party.sequenceId,kind:'goal',partyStartedAtMs:6000,partyUntilMs:43000});
    now=42000;expect(c.accept(reward('a',{goalReached:true}))).toEqual([]);expect(c.nextTransitionAt()).toBe(43000);
});
test('a fresh batch goal cannot upgrade the party before its thank-you',()=>{
    c.accept(gift('a',{milestoneCents:250000}));now=6000;c.advance();now=7000;
    expect(c.accept(gift('b',{goalReached:true}))).toEqual([]);
    now=24000;expect(c.advance()[0].phase).toBe('recognition');now=29000;expect(c.advance()[0]).toMatchObject({kind:'goal',partyUntilMs:49000});
});
test('delayed reward for older thanks waits until a newer recognition finishes',()=>{
    c.accept(gift());now=6000;c.advance();now=7000;c.accept(gift('b'));now=8000;
    expect(c.accept(reward())).toEqual([]);now=12000;expect(c.advance()[0]).toMatchObject({phase:'party',kind:'milestone'});
});
test('new gifts after an ordinary window start a new sequence without repeating old amounts',()=>{
    const old=c.accept(gift())[0];now=7000;const next=c.accept(gift('b'))[0];expect(next.sequenceId).not.toBe(old.sequenceId);expect(next.donationCount).toBe(1);expect(draws).toBe(2);
});
test('hidden pending money remains null',()=>{
    c.accept(gift('a',{milestoneCents:250000}));now=6000;c.advance();c.accept(gift('b',{donationTotalCents:null}));c.accept(gift('c'));
    now=24000;expect(c.advance()[0]).toMatchObject({donationCount:2,donationTotalCents:null});
});
test('repeated fresh IDs do not extend recognition or add money',()=>{
    c.accept(gift());now=3000;expect(c.accept(gift())).toEqual([]);expect(c.nextTransitionAt()).toBe(6000);
});
test('unsafe aggregate leaves the existing recognition unchanged',()=>{
    c.accept(gift('a',{donationTotalCents:Number.MAX_SAFE_INTEGER}));now=2000;expect(()=>c.accept(gift('b',{donationTotalCents:1}))).toThrow();
    expect(c.nextTransitionAt()).toBe(6000);expect(c.accept(gift('b',{donationTotalCents:0}))[0]).toMatchObject({donationCount:2,donationTotalCents:Number.MAX_SAFE_INTEGER});
});
test('clear discards active and pending effects and leaves no timer deadline',()=>{
    c.accept(gift('a',{milestoneCents:250000}));now=6000;c.advance();c.accept(gift('b'));c.clear();now=100000;expect(c.advance()).toEqual([]);expect(c.nextTransitionAt()).toBeNull();
});
test.each([0,0.499,0.5,0.999])('random draw %s selects one coherent action',draw=>{
    c=createCampaignCelebrationComposer({clock:{nowMs:()=>now},random:()=>draw});expect(c.accept(gift())[0].recognitionAction).toBe(draw<0.5?'jump':'hug');
});
test.each([-1,1,NaN])('invalid random draw %s cannot corrupt the composer',draw=>{
    c=createCampaignCelebrationComposer({clock:{nowMs:()=>now},random:()=>draw});expect(()=>c.accept(gift())).toThrow();expect(c.nextTransitionAt()).toBeNull();
});
test('known rewards are not revived after a stalled timer outlives their correlation',()=>{
    c.accept(gift('a',{milestoneCents:250000}));now=121001;
    expect(c.advance()).toEqual([]);expect(c.nextTransitionAt()).toBeNull();
});
test('a reward for older thanks during another party queues no fabricated donation caption',()=>{
    c.accept(gift('a'));now=6000;c.advance();now=7000;c.accept(gift('b',{milestoneCents:250000}));now=12000;c.advance();
    now=13000;expect(c.accept(reward('a'))).toEqual([]);now=30000;
    expect(c.advance()[0]).toMatchObject({phase:'party',donationCount:0,recognitionAction:null,partyUntilMs:48000});
});
test.each([{donationCount:2},{donationTotalCents:-1},{campaignTotalCents:1.5},{milestoneCents:300000},{goalReached:'yes'}])('invalid intent %j leaves no effects',patch=>{
    expect(()=>c.accept(gift('a',patch))).toThrow();expect(c.nextTransitionAt()).toBeNull();
});
test('a delayed goal upgrade keeps new party-time gifts in one later thank-you',()=>{
    c.accept(gift('a',{milestoneCents:250000}));now=6000;const original=c.advance()[0];
    now=7000;c.accept(gift('b',{donationTotalCents:1000}));now=8000;c.accept(gift('c',{donationTotalCents:1500}));
    now=9000;expect(c.accept(reward('a',{goalReached:true}))[0]).toMatchObject({sequenceId:original.sequenceId,kind:'goal',partyUntilMs:29000,donationCount:0});
    now=28000;expect(c.advance()).toEqual([]);now=29000;
    const next=c.advance()[0];expect(next).toMatchObject({phase:'recognition',donationCount:2,donationTotalCents:2500,heartsUntilMs:34000});expect(next.sequenceId).not.toBe(original.sequenceId);
    now=34000;expect(c.advance()).toEqual([]);expect(draws).toBe(2);
});
function completedMilestone(){c.accept(gift('a'));now=6000;c.advance();now=16000;const first=c.accept(reward('a'))[0];now=34000;c.advance();return first;}
test('goal confirmation after party expiry retains its original start and maximum span',()=>{
    const first=completedMilestone();now=46000;
    expect(c.accept(reward('a',{goalReached:true}))[0]).toMatchObject({sequenceId:first.sequenceId,kind:'goal',partyStartedAtMs:16000,partyUntilMs:54000});
    now=54000;expect(c.advance()).toEqual([]);expect(c.accept(reward('a',{goalReached:true}))).toEqual([]);
});
test('completed-party goal confirmation beyond the original 38-second bound is discarded',()=>{
    completedMilestone();now=55000;expect(c.accept(reward('a',{goalReached:true}))).toEqual([]);expect(c.nextTransitionAt()).toBeNull();
});
test.each(['recognition','party'])('an expired party cannot transfer its goal upgrade into newer %s',phase=>{
    completedMilestone();now=35000;c.accept(gift('b',phase==='party'?{milestoneCents:300000,campaignTotalCents:305000}:{}));
    if(phase==='party'){now=40000;c.advance();}
    const deadline=c.nextTransitionAt();now=phase==='party'?46000:36000;
    expect(c.accept(reward('a',{goalReached:true}))).toEqual([]);expect(c.nextTransitionAt()).toBe(deadline);
    now=deadline;expect(c.advance()).toEqual([]);expect(c.nextTransitionAt()).toBeNull();
    expect(c.accept(reward('a',{goalReached:true}))).toEqual([]);
});
