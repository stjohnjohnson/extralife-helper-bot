const { createCampaignProgress } = require('../src/streamAvatars/campaignProgress');
const { createCampaignState } = require('../src/streamAvatars/campaignState');
let controller, memory, store, now;
const make=async()=>{ controller=await createCampaignProgress({store,clock:{nowMs:()=>now},mode:'production',participantId:'12',intervalCents:50000,newEpochId:()=>String(++now)});return controller; };
const update=(patch={})=>controller.acceptObservation({expectedEpochId:controller.getPollCheckpoint().epochId,batchId:'batch',observedAtMs:now, ...patch});
beforeEach(()=>{now=1000;memory=null;store={load:async()=>memory,save:jest.fn(async v=>{memory=structuredClone(v);}),flush:async()=>{},close:async()=>{},archiveAndReset:async()=>createCampaignState({mode:'production',participantId:'12',intervalCents:50000}),recoverLastBackup:async()=>memory};});
afterEach(async()=>{await controller?.stop();});
test('intake requires no Twitch observation; persists before any effect subscriber',async()=>{
    await make();await update({baseline:true,complete:true,donations:[],campaign:{totalCents:247500,goalCents:1000000,observedAtMs:now}});
    controller.subscribe(()=>expect(memory.processedDonationIds).toContain('fresh'));
    const r=await update({donations:[{id:'fresh',participantId:'12',createdAtMs:now,amountCents:5000}]});
    expect(r.intent.donationCount).toBe(1);expect(controller.getPollCheckpoint()).toMatchObject({baselineNeeded:false,participantId:'12'});
});
test('failed persistence emits nothing and does not commit ID or confirmation state',async()=>{
    await make();await update({baseline:true,complete:true,donations:[]});const listener=jest.fn();controller.subscribe(listener);
    store.save.mockRejectedValueOnce(new Error('disk full'));
    await expect(update({donations:[{id:'fresh',participantId:'12',createdAtMs:now,amountCents:5000}]})).rejects.toThrow();
    expect(controller.getSnapshot().processedDonationIds).not.toContain('fresh');expect(listener).not.toHaveBeenCalled();expect(controller.getStatus().recoveryRequired).toBe(true);
});
test('restart silently baselines missed gifts and current totals; rejects old epoch after reset',async()=>{
    await make();await update({baseline:true,complete:true,donations:[],campaign:{totalCents:247500,goalCents:1000000,observedAtMs:now}});
    const epoch=controller.getPollCheckpoint().epochId;await controller.stop();await make();
    expect((await update({complete:true,donations:[{id:'missed',participantId:'12',createdAtMs:now,amountCents:5000}],campaign:{totalCents:252500,goalCents:1000000,observedAtMs:now}})).intent).toBeNull();
    await controller.reset();expect((await controller.acceptObservation({expectedEpochId:epoch,batchId:'stale',observedAtMs:now})).accepted).toBe(false);
});
test('corrupt store gates effects until confirmed recovery; stop drains and closes',async()=>{
    store.load=async()=>{throw new Error('corrupt');};await make();expect(controller.getStatus().recoveryRequired).toBe(true);
    await expect(update({donations:[]})).rejects.toThrow(/recovery/i);
    memory=createCampaignState({mode:'production',participantId:'12',intervalCents:50000});await controller.recover();expect(controller.getStatus().recoveryRequired).toBe(false);
});
