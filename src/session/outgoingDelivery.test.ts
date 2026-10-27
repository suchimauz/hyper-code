import { expect, test } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';

async function fixture() {
    const ctx = await mkTestCtx();
    const a = await ctx.fns.agent.start({model:'mock:echo'});
    const b = await ctx.fns.agent.start({model:'mock:echo'});
    await ctx.fns.session.save({agent:a});
    await ctx.fns.session.save({agent:b});
    const delivery = {key:crypto.randomUUID(),text:'hello',author:'agent:'+a.id,messageType:'agent_message',event:{type:'user',text:'hello'},wake:false,outgoing:{from:a.id,title:'Recipient',body:'hello',hop:1}};
    const outgoing = async () => (await ctx.fns.session.getEvents({id:a.id})).filter((e:any)=>e.type==='agent_message_outgoing');
    return {ctx,a,b,delivery,outgoing};
}

test('outgoing receipt: one delivered sender event, no sender transcript, stable retry', async () => {
    const {ctx,a,b,delivery,outgoing} = await fixture();
    const before = await ctx.fns.session.getMessages({id:a.id});
    const results = await Promise.all(Array.from({length:4},()=>ctx.fns.session.deliverInbound({id:b.id,delivery})));
    expect(results.every(r=>!r.queued)).toBe(true);
    const events = await outgoing();
    expect(events).toHaveLength(1);
    expect(events[0].outgoingAgentMessage).toEqual({deliveryKey:delivery.key,to:b.id,title:'Recipient',body:'hello',hop:1,status:'delivered',messageIdx:results[0].messageIdx});
    expect(await ctx.fns.session.getMessages({id:a.id})).toEqual(before);
    expect((await ctx.fns.session.getMessages({id:b.id})).filter((m:any)=>m.content==='hello')).toHaveLength(1);
    await expect(ctx.fns.session.deliverInbound({id:b.id,delivery:{...delivery,text:'changed'}})).rejects.toThrow('payload mismatch');
    expect(await outgoing()).toHaveLength(1);
});

test('outgoing receipt: compaction queues silently then recovery drain projects once', async () => {
    const {ctx,a,b,delivery,outgoing} = await fixture();
    await ctx.fns.procs.db.run({sql:'UPDATE agents SET sleep_context=? WHERE id=?',params:[JSON.stringify({draftRevision:1}),b.id]});
    expect(await ctx.fns.session.deliverInbound({id:b.id,delivery})).toMatchObject({queued:true,messageIdx:null});
    expect(await outgoing()).toHaveLength(0);
    await ctx.fns.procs.db.run({sql:'UPDATE agents SET sleep_context=NULL, stopped_at=? WHERE id=?',params:[Date.now(),b.id]});
    expect(await ctx.fns.session.deliverInbound({id:b.id})).toMatchObject({drained:1});
    expect(await outgoing()).toHaveLength(1);
    expect((await outgoing())[0].outgoingAgentMessage.status).toBe('delivered');
    expect(await ctx.fns.session.deliverInbound({id:b.id,delivery})).toMatchObject({duplicate:true,queued:false,drained:0});
    expect(await outgoing()).toHaveLength(1);
});

test('outgoing receipt: legacy inbound has no sender projection; unavailable target has none', async () => {
    const {ctx,b,delivery,outgoing} = await fixture();
    const {outgoing:_,...legacy} = delivery;
    await ctx.fns.session.deliverInbound({id:b.id,delivery:legacy});
    expect(await outgoing()).toHaveLength(0);
    await expect(ctx.fns.session.deliverInbound({id:'missing-outgoing-test',delivery})).rejects.toThrow('recipient unavailable');
    expect(await outgoing()).toHaveLength(0);
});

test('outgoing receipt: concurrent bidirectional sends complete without duplicates', async () => {
    const {ctx,a,b,delivery,outgoing} = await fixture();
    const reverse = {...delivery,key:crypto.randomUUID(),author:'agent:'+b.id,outgoing:{...delivery.outgoing,from:b.id}};
    await Promise.all([ctx.fns.session.deliverInbound({id:b.id,delivery}),ctx.fns.session.deliverInbound({id:a.id,delivery:reverse})]);
    expect(await outgoing()).toHaveLength(1);
    expect((await ctx.fns.session.getEvents({id:b.id})).filter((e:any)=>e.type==='agent_message_outgoing')).toHaveLength(1);
});
