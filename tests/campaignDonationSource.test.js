const {createDonationSource}=require('../src/donations/source');
const time=Date.parse('2026-10-09T10:00:00Z');
const row=(n,extra={})=>({donationID:'id'+n,participantID:'12',amount:25,createdDateUTC:new Date(time-n*1000).toISOString(),...extra});
const response=(records,count,status=200)=>({status,headers:new Headers(count===undefined?{}:{'num-records':String(count),'api-version':'1.4'}),json:async()=>records});
const checkpoint=(patch={})=>({epochId:'epoch',participantId:'12',baselineAtMs:time-200000,baselineNeeded:false,rawSeenDonationIds:[],recordCount:0,...patch});
function setup(pages) { const fetch=jest.fn();pages.forEach(p=>fetch.mockResolvedValueOnce(p));return {fetch,source:createDonationSource({fetch,requestGapMs:0,clock:{nowMs:()=>time+1000}})}; }
const poll=(source,patch={})=>source.pollCampaignDonations({participantId:'12',checkpoint:checkpoint(),...patch});
test('normal discovery uses one newest page and delivers normalized gifts before totals',async()=>{
    const {source,fetch}=setup([response([row(1),row(2)],2)]);let delivered;
    const r=await poll(source,{onDonations:async value=>{delivered=value;}});expect(delivered.donations).toHaveLength(2);expect(r).toMatchObject({complete:true,recordCount:2,rawSeenIds:['id1','id2']});
    expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][0]).toContain('version=1.4');expect(fetch.mock.calls[0][0]).toContain('offset=0');
});
test('initial baseline needs one page even with years of history',async()=>{
    const {source,fetch}=setup([response(Array.from({length:100},(_,i)=>row(i)),1000)]);
    expect((await poll(source,{checkpoint:checkpoint({baselineNeeded:true})})).donations).toHaveLength(100);expect(fetch).toHaveBeenCalledTimes(1);
});
test('known first-page IDs cannot hide a backdated new row while count growth remains unexplained',async()=>{
    const first=Array.from({length:100},(_,i)=>row(i));const second=[row(150)];const known=first.map(r=>r.donationID);
    const {source,fetch}=setup([response(first,101),response(second,101)]);
    const r=await poll(source,{checkpoint:checkpoint({rawSeenDonationIds:known,recordCount:100})});
    expect(r.donations.some(d=>d.id==='id150')).toBe(true);expect(fetch).toHaveBeenCalledTimes(2);
});
test('more than one hundred new gifts catch up with exact IDs and completed metadata',async()=>{
    const {source,fetch}=setup([response(Array.from({length:100},(_,i)=>row(i)),140),response(Array.from({length:40},(_,i)=>row(100+i)),140)]);
    const r=await poll(source);expect(r.donations).toHaveLength(140);expect(r.rawSeenIds).toHaveLength(140);expect(fetch).toHaveBeenCalledTimes(2);
});
test('a failed later page leaves prompt latest and donation callbacks intact without completing a checkpoint',async()=>{
    const {source}=setup([response(Array.from({length:100},(_,i)=>row(i)),140),response(null,undefined,500)]);const pages=[];let latest=0;
    await expect(poll(source,{onLatest:()=>latest++,onDonations:p=>pages.push(p)})).rejects.toThrow();expect(latest).toBe(1);expect(pages).toHaveLength(1);expect(pages[0]).toMatchObject({complete:false});
});
test.each(['changed','repeated'])('unstable %s pagination fails rather than reporting complete',async kind=>{
    const first=Array.from({length:100},(_,i)=>row(i));const {source}=setup([response(first,200),response(kind==='repeated'?first:[row(100)],kind==='changed'?201:200)]);
    await expect(poll(source)).rejects.toThrow();
});
test('missing count falls back to a bounded scan since monitoring began',async()=>{
    const {source,fetch}=setup([response(Array.from({length:100},(_,i)=>row(i))),response([row(100)])]);expect((await poll(source)).complete).toBe(true);expect(fetch).toHaveBeenCalledTimes(2);
});
test('excluded registration/invalid rows still participate in raw census; duplicate rows do not double count',async()=>{
    const {source}=setup([response([row(1),row(1),row(2,{isRegFee:true}),row(3,{amount:1.111})],4)]);
    const r=await poll(source);expect(r.donations).toHaveLength(1);expect(r.rawSeenIds).toEqual(['id1','id2','id3']);
});
test('pre-baseline boundary avoids scanning annual history and only forwards recent gifts',async()=>{
    const {source,fetch}=setup([response(Array.from({length:100},(_,i)=>row(i)),10000)]);
    const r=await poll(source,{checkpoint:checkpoint({baselineAtMs:time-1000})});expect(r.donations).toHaveLength(2);expect(fetch).toHaveBeenCalledTimes(1);
});
test('cancellation and malformed checkpoint identities fail before requesting',async()=>{
    const {source,fetch}=setup([]);await expect(poll(source,{signal:AbortSignal.abort()})).rejects.toThrow();
    await expect(poll(source,{checkpoint:checkpoint({participantId:'other'})})).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
});
test('conflicting duplicate facts are diagnosed without forwarding the same donation twice',async()=>{
    const logger={warn:jest.fn()};const fetch=jest.fn().mockResolvedValue(response([row(1),row(1,{amount:50})],2));
    const source=createDonationSource({fetch,logger,requestGapMs:0,clock:{nowMs:()=>time+1000}});
    const result=await poll(source);expect(result.donations.map(d=>d.amountCents)).toEqual([2500]);
    expect(logger.warn).toHaveBeenCalledWith('Donation record excluded',{code:'conflicting-donation'});
});
