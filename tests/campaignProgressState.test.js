const { createCampaignState, reduceCampaignProgress, validateCampaignState } = require('../src/streamAvatars/campaignState');
const identity = { mode:'production', participantId:'12', intervalCents:50000 };
let state, pending;
const gift = (id='d', amountCents=5000, createdAtMs=1001) => ({ id,participantId:'12',createdAtMs,amountCents });
function accept(input={}) { const r=reduceCampaignProgress(state,{batchId:'batch',observedAtMs:1100,intervalCents:50000,...input},{pendingConfirmations:pending}); state=r.state;pending=r.pendingConfirmations;return r; }
function campaign(totalCents=247500,goalCents=1000000,observedAtMs=1000) { return { totalCents,goalCents,observedAtMs }; }
beforeEach(()=>{ state=createCampaignState(identity);pending=[];accept({baseline:true,complete:true,donations:[],rawSeenIds:[],recordCount:0,observedAtMs:1000,campaign:campaign()}); });
test('campaign baseline is silent; fresh gift then authoritative crossing ignores stream status',()=>{
    expect(accept({donations:[gift()]}).intent).toMatchObject({donationCount:1,donationTotalCents:5000,milestoneCents:null});
    expect(accept({campaign:campaign(252500,1000000,1100)}).intent).toMatchObject({campaignTotalCents:252500,milestoneCents:250000,goalReached:false,donationCount:0});
    expect(accept({donations:[gift()],campaign:campaign(252500,1000000,1100)}).intent).toBeNull();
    expect(state).not.toHaveProperty('startedAtMs');expect(validateCampaignState(state,identity)).toEqual(state);
});
test('a fresh small donation wins goal and milestone once',()=>{
    state=createCampaignState(identity);pending=[];accept({baseline:true,complete:true,donations:[],observedAtMs:1000,campaign:campaign(99000,100000,1050)});
    const r=accept({donations:[gift('goal',1000)],campaign:campaign(100000,100000,1100)});
    expect(r.intent).toMatchObject({goalReached:true,milestoneCents:100000});
    expect(accept({campaign:campaign(100000,100000,1200)}).intent).toBeNull();
});
test('duplicates, old revelation, invalid records and pre-baseline history cannot create fresh rewards',()=>{
    accept({donations:[gift('hidden',null)]});pending=[];
    expect(accept({donations:[gift('hidden',50)],campaign:campaign(250000,1000000,1200)}).intent).toBeNull();
    const r=accept({donations:[gift('old',5000,999),gift('wrong',5000),{...gift('bad'),participantId:'13'},gift('negative',-1),{...gift('fraction'),amountCents:1.2}]});
    expect(r.intent).toMatchObject({donationCount:1});expect(r.diagnostics).toContain('invalid-donation');
});
test('hidden combined money stays null without making campaign totals incomplete',()=>{
    expect(accept({donations:[gift('a',null),gift('b',100)]}).intent).toMatchObject({donationCount:2,donationTotalCents:null,campaignTotalCents:247500});
});
test.each([119999,120001])('confirmation age %s fences historical crossings',age=>{
    accept({donations:[gift()]}); const r=accept({observedAtMs:1100+age,campaign:campaign(252500,1000000,1100+age)});
    expect(r.intent?.milestoneCents ?? null).toBe(age<120000 ? 250000 : null);
    expect(state.donationCheckpointCount).toBe(5);
});
test('decreases, stale observations and changed interval do not rearm handled thresholds',()=>{
    accept({donations:[gift()],campaign:campaign(252500,1000000,1100)});
    expect(accept({campaign:campaign(100000,1000000,1200)}).intent).toBeNull();
    expect(accept({donations:[gift('second')],campaign:campaign(252500,1000000,1300)}).intent.milestoneCents).toBeNull();
    expect(accept({campaign:campaign(350000,1000000,1250)}).intent).toBeNull();
    expect(state.campaignObservation.totalCents).toBe(252500);
    expect(accept({intervalCents:10000,campaign:campaign(260000,1000000,1400)}).intent).toBeNull();
    expect(state.donationCheckpointCount).toBe(26);
});
test('changed goals silently rebase; already handled goal never rearms',()=>{
    state=createCampaignState(identity);pending=[];accept({baseline:true,complete:true,donations:[],observedAtMs:1000,campaign:campaign(99000,100000,1050)});
    accept({donations:[gift('one',1000)],campaign:campaign(100000,100000,1100)});
    expect(accept({campaign:campaign(100000,200000,1200)}).intent).toBeNull();
    expect(accept({donations:[gift('two')],campaign:campaign(200000,200000,1300)}).intent.goalReached).toBe(false);
});
test('first available total silently baselines even when gifts were acknowledged earlier',()=>{
    state=createCampaignState(identity);pending=[];
    accept({baseline:true,complete:true,donations:[],observedAtMs:1000});
    expect(accept({donations:[gift()]}).intent.campaignTotalCents).toBeNull();
    expect(accept({campaign:campaign(250000,1000000,1200)}).intent).toBeNull();
});
test('partial pages retain accepted IDs but cannot advance completed census/count metadata',()=>{
    accept({donations:[gift()],rawSeenIds:['d'],recordCount:1,complete:false});
    expect(state.processedDonationIds).toContain('d');expect(state.recordCount).toBe(0);expect(state.rawSeenDonationIds).toEqual([]);
    accept({rawSeenIds:['d','excluded'],recordCount:2,complete:true});
    expect(state.recordCount).toBe(2);expect(state.rawSeenDonationIds).toEqual(['d','excluded']);
});
test('unsafe amounts reject the batch without mutating prior state',()=>{
    const original=structuredClone(state);
    expect(()=>accept({donations:[gift('a',Number.MAX_SAFE_INTEGER),gift('b',1)]})).toThrow();expect(state).toEqual(original);
});
test.each([{schemaVersion:2},{revision:-1},{extra:true},{recordCount:1.5},{processedDonationIds:['d','d']},{campaignObservation:campaign(-1)}])('strict stored state rejects %j',patch=>{
    expect(()=>validateCampaignState({...state,...patch},identity)).toThrow();
});
test('second-resolution donation timestamps do not lose a newly visible same-second gift',()=>{
    state=createCampaignState(identity);pending=[];
    accept({baseline:true,complete:true,observedAtMs:1800,donations:[gift('known',5000,1000)]});
    expect(accept({observedAtMs:1900,donations:[gift('new',5000,1000)]}).intent).toMatchObject({donationCount:1});
});
test('an already-met startup goal and unexplained historical crossing stay silent',()=>{
    state=createCampaignState(identity);pending=[];
    expect(accept({baseline:true,campaign:campaign(120000,100000,1000)}).intent).toBeNull();
    expect(state.goalHandled).toBe(true);
    expect(accept({campaign:campaign(200000,100000,1200)}).intent).toBeNull();
});
