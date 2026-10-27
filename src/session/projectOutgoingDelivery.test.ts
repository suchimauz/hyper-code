import { expect, test } from 'bun:test';
import project from './projectOutgoingDelivery';

const opts = {from:'sender',to:'recipient',deliveryKey:'stable-key',title:'Recipient',body:'full body <not html>',hop:2,createdAt:123,messageIdx:7};

test('outgoing projection only writes events, with complete delivered metadata', async () => {
    const writes:any[] = [];
    const ctx:any = {fns:{procs:{db:{select:async()=>[],run:async(o:any)=>{writes.push(o);}}}}};
    await project(ctx,null,opts);
    expect(writes).toHaveLength(1);
    expect(writes[0].sql).toStartWith('INSERT INTO events');
    expect(JSON.parse(writes[0].params[2])).toEqual({type:'agent_message_outgoing',actor:'agent:sender',ts:123,outgoingAgentMessage:{deliveryKey:'stable-key',to:'recipient',title:'Recipient',body:'full body <not html>',hop:2,status:'delivered',messageIdx:7}});
});

test('outgoing projection lookup deduplicates per sender, recipient and delivery key', async () => {
    const writes:any[] = [], reads:any[] = [];
    const ctx:any = {fns:{procs:{db:{select:async(o:any)=>{reads.push(o);return [{idx:4}];},run:async(o:any)=>{writes.push(o);}}}}};
    await project(ctx,null,opts);
    expect(reads[0].params).toEqual(['sender','stable-key','recipient']);
    expect(writes).toHaveLength(0);
});

test('outgoing projection failure propagates for caller transaction rollback', async () => {
    const ctx:any = {fns:{procs:{db:{select:async()=>[],run:async()=>{throw new Error('events_pkey collision');}}}}};
    await expect(project(ctx,null,opts)).rejects.toThrow('events_pkey collision');
});
