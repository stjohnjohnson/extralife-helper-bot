const {decodeCampaignClientMessage,validateCampaignServerMessage,publicCampaign}=require('../src/streamAvatars/protocol');
const {createCampaignState}=require('../src/streamAvatars/campaignState');
const base={version:3,type:'celebration',mode:'production',generation:1,campaignId:'12',id:'event',sequenceId:'sequence',issuedAtMs:1000,expiresAtMs:11000,phase:'recognition',kind:'donation',campaignTotalCents:null,milestoneCents:null,donationCount:1,donationTotalCents:5000,recognitionStartedAtMs:1000,recognitionAction:'hug',heartsUntilMs:6000,partyStartedAtMs:null,partyUntilMs:0};
const party={...base,phase:'party',kind:'milestone',campaignTotalCents:252500,milestoneCents:250000,donationCount:0,donationTotalCents:0,recognitionStartedAtMs:null,recognitionAction:null,heartsUntilMs:0,partyStartedAtMs:1000,partyUntilMs:19000};
test('v3 recognition and party carry separate bounded phases and nullable startup total',()=>{
    expect(validateCampaignServerMessage(base)).toEqual(base);expect(validateCampaignServerMessage(party)).toEqual(party);
    expect(validateCampaignServerMessage({...party,kind:'goal',milestoneCents:null,partyUntilMs:21000})).toMatchObject({kind:'goal'});
});
test('public campaign is bounded and omits all donor/stream state',()=>{
    const state=createCampaignState({mode:'production',participantId:'12'});state.processedDonationIds=['private'];
    expect(publicCampaign(state)).toEqual({campaignId:'12',initialized:false,totalCents:null,goalCents:null,nextMilestoneCents:null,goalHandled:false});
    state.campaignObservation={observedAtMs:1000,totalCents:252500,goalCents:1000000};state.donationCheckpointCount=5;
    expect(publicCampaign(state)).toMatchObject({totalCents:252500,nextMilestoneCents:300000});
    const snap={version:3,type:'snapshot',mode:'production',generation:1,serverNowMs:1000,campaign:publicCampaign(state),integration:{active:false,crowdIds:[]},features:['campaign','celebrations','donation-recognition']};
    expect(validateCampaignServerMessage(snap)).toEqual(snap);expect(()=>validateCampaignServerMessage({...snap,elapsedMs:1})).toThrow();
});
test.each([{version:2},{phase:'party'},{phase:'future'},{kind:'goal'},{partyStartedAtMs:1000},{partyUntilMs:19000},{donationCount:0},{heartsUntilMs:11001},{recognitionAction:'explode'},{campaignTotalCents:-1},{campaignTotalCents:1.5},{milestoneCents:250000},{command:'!mass !dance'},{sequenceId:''},{expiresAtMs:11001},{donationTotalCents:Number.MAX_SAFE_INTEGER+1}])('strict recognition rejects %j',patch=>expect(()=>validateCampaignServerMessage({...base,...patch})).toThrow());
test.each([{donationCount:1},{recognitionAction:'jump'},{recognitionStartedAtMs:1000},{heartsUntilMs:6000},{campaignTotalCents:null},{milestoneCents:300000},{partyStartedAtMs:1001},{partyUntilMs:39001},{partyUntilMs:900},{phase:'recognition'}])('strict party rejects %j',patch=>expect(()=>validateCampaignServerMessage({...party,...patch})).toThrow());
test('client vocabulary requires v3 and finite typed values',()=>{
    expect(decodeCampaignClientMessage(JSON.stringify({version:3,type:'ready',capabilities:['campaign','celebrations','donation-recognition'],resolution:{width:1920,height:1080}})).type).toBe('ready');
    for(const value of [{version:2,type:'heartbeat'},{version:3,type:'command',text:'execute'},{version:3,type:'auth',token:'secret',extra:true},{version:3,type:'ready',capabilities:['session'],resolution:{width:1,height:1}}])expect(()=>decodeCampaignClientMessage(JSON.stringify(value))).toThrow();
});
