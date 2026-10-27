import { expect, test } from 'bun:test';
import deliverInbound from './deliverInbound';
import projectOutgoingDelivery from './projectOutgoingDelivery';
import syncAgentState from './syncAgentState';

// Pure transaction model: no bootstrap, Postgres, extensions, or working DB.
function fixture(options: { compacting?: boolean; fail?: 'projection' | 'after-projection' | 'messages'; error?: object; alwaysFail?: boolean } = {}) {
    const delivery = { key: 'immutable', text: 'hello', author: 'agent:sender', messageType: 'agent_message', event: {type:'user'}, wake: false,
        outgoing: {from:'sender', title:'Recipient', body:'hello', hop:1} };
    type Store = { receipts: any[]; messages: any[]; events: any[] };
    let store: Store = {receipts:[], messages:[], events:[]};
    let compacting = options.compacting ?? false, active = false, attempts = 0, failures = 0;
    const trace: string[] = [], writes: any[] = [];
    const inflight = [{role:'assistant',content:'in-flight reference'}];
    const sender = {id:'sender', messages:inflight, events:[], lastProcessedMsgIdx:42};
    function fail(at: string) {
        if (options.fail === at && (!failures || options.alwaysFail)) {
            failures++;
            throw Object.assign(new Error('injected failure'), options.error ?? {code:'23505'});
        }
    }
    const ctx: any = {state:{agent:{sender}}, fns:{procs:{db:{
        transaction: async ({fn}: any) => {
            expect(active).toBe(false);
            const before = structuredClone(store);
            active = true; attempts++; trace.push('begin');
            try {const result=await fn(); active=false; trace.push('commit'); return result;}
            catch(error) {store=before; active=false; trace.push('rollback'); throw error;}
        },
        select: async ({sql,params:p}: any) => {
            if (sql.startsWith('SELECT sleep_context')) return [{sleep_context:compacting?{draftRevision:1}:null}];
            if (sql.startsWith('SELECT payload')) return store.receipts.filter(r=>r.agent_id===p[0]&&r.key===p[1]);
            if (sql.startsWith('SELECT seq,payload')) return store.receipts.filter(r=>r.agent_id===p[0]&&r.delivered_at==null);
            if (sql.startsWith('SELECT message_idx')) return store.receipts.filter(r=>r.agent_id===p[0]&&r.key===p[1]);
            if (sql.startsWith('SELECT idx FROM events')) return store.events.filter(e=>e.agent_id===p[0]&&e.type==='agent_message_outgoing'&&e.payload.outgoingAgentMessage.deliveryKey===p[1]&&e.payload.outgoingAgentMessage.to===p[2]);
            throw new Error('unexpected select: '+sql);
        },
        run: async ({sql,params:p}: any) => {
            expect(active).toBe(true); writes.push({sql,params:p});
            if (sql.startsWith('INSERT INTO session_inbound')) store.receipts.push({agent_id:p[0],key:p[1],payload:p[2],seq:store.receipts.length+1});
            else if (sql.startsWith('INSERT INTO messages')) {
                fail('messages');
                const idx=store.messages.filter(m=>m.agent_id===p[0]).length;
                store.messages.push({agent_id:p[0],idx,content:p[1]}); trace.push('recipient-message'); return {rows:[{idx}]};
            } else if (sql.startsWith('INSERT INTO events')) {
                if (p[1]==='agent_message_outgoing') fail('projection');
                const idx=store.events.filter(e=>e.agent_id===p[0]).length;
                store.events.push({agent_id:p[0],idx,type:p[1],payload:JSON.parse(p[2])});
                trace.push(p[1]==='agent_message_outgoing'?'sender-event':'recipient-event'); return {rows:[{idx}]};
            } else if (sql.startsWith('UPDATE session_inbound')) {
                Object.assign(store.receipts.find(r=>r.seq===p[3]),{delivered_at:p[0],message_idx:p[1],event_idx:p[2]}); trace.push('receipt');
            } else if (sql.startsWith('UPDATE agents SET updated_at')) fail('after-projection');
            else throw new Error('unexpected write: '+sql);
            return {rows:[]};
        },
    },events:{refresh:({topic}: any)=>{expect(active).toBe(false);trace.push('refresh:'+topic);}},log:{warn:async()=>{}}},
    session:{
        scrubUnicode:async({text}: any)=>text,
        projectOutgoingDelivery:async(o: any)=>{
            expect(active).toBe(true);
            expect(store.messages.some(m=>m.agent_id==='recipient'&&m.idx===o.messageIdx)).toBe(true);
            expect(store.receipts.some(r=>r.delivered_at!=null&&r.message_idx===o.messageIdx)).toBe(true);
            return projectOutgoingDelivery(ctx,null,o);
        },
        getMessages:async({id}: any)=>{expect(active).toBe(false);trace.push('getMessages:'+id);return store.messages.filter(m=>m.agent_id===id);},
        getEvents:async({id}: any)=>{expect(active).toBe(false);trace.push('getEvents:'+id);return store.events.filter(e=>e.agent_id===id).map(e=>e.payload);},
        syncAgentState:async(o: any)=>{expect(active).toBe(false);trace.push('sync:'+o.agent.id);return syncAgentState(ctx,null,o);},
    },agent:{wakeWaiters:async()=>{expect(active).toBe(false);},wakeWorker:()=>{expect(active).toBe(false);}}}};
    return {ctx,delivery,sender,inflight,trace,writes,store:()=>store,attempts:()=>attempts,unblock:()=>{compacting=false;},send:()=>deliverInbound(ctx,null,{id:'recipient',delivery}),drain:()=>deliverInbound(ctx,null,{id:'recipient'})};
}

test('isolated inbound: compaction queues without projection or refresh; drain projects after receipt', async()=>{
    const f=fixture({compacting:true});
    expect(await f.send()).toEqual({queued:true,messageIdx:null,duplicate:false,drained:0});
    expect(f.store().messages).toHaveLength(0); expect(f.store().events).toHaveLength(0);
    expect(f.trace).toEqual(['begin','commit']);
    f.unblock(); expect(await f.drain()).toMatchObject({drained:1});
    expect(f.trace.indexOf('recipient-message')).toBeLessThan(f.trace.indexOf('receipt'));
    expect(f.trace.indexOf('receipt')).toBeLessThan(f.trace.indexOf('sender-event'));
    expect(f.trace.lastIndexOf('commit')).toBeLessThan(f.trace.indexOf('refresh:agent:sender'));
    expect(await f.send()).toMatchObject({duplicate:true,queued:false,drained:0});
    expect(f.store().events.filter(e=>e.agent_id==='sender')).toHaveLength(1);
});

for (const [label,fail,error] of [
    ['sender idx conflict','projection',{code:'23505'}],
    ['recipient idx conflict','messages',{code:'23505'}],
    ['deadlock code','after-projection',{code:'40P01'}],
    ['deadlock errno','after-projection',{errno:'40P01'}],
    ['idx message fallback','projection',{message:'events_pkey collision'}],
] as const) test('isolated inbound rollback/retry: '+label, async()=>{
    const f=fixture({fail,error});
    expect(await f.send()).toMatchObject({queued:false,drained:1});
    expect(f.attempts()).toBe(2);
    expect(f.store().messages).toHaveLength(1);
    expect(f.store().receipts).toHaveLength(1);
    expect(f.store().events.filter(e=>e.agent_id==='sender')).toHaveLength(1);
    expect(f.trace.filter(t=>t==='refresh:agent:sender')).toHaveLength(1);
    expect(f.trace.indexOf('refresh:agent:sender')).toBeGreaterThan(f.trace.lastIndexOf('commit'));
});

test('isolated inbound: permanent rollback leaves no delivered event or refresh', async()=>{
    const f=fixture({fail:'after-projection',error:{code:'XX000'}});
    await expect(f.send()).rejects.toThrow('injected failure');
    expect(f.store()).toEqual({receipts:[],messages:[],events:[]});
    expect(f.trace.some(t=>t.startsWith('refresh:')||t.startsWith('sync:'))).toBe(false);
});

test('isolated inbound: bounded retry exhaustion does not refresh rolled-back sender', async()=>{
    const f=fixture({fail:'after-projection',error:{code:'40P01'},alwaysFail:true});
    await expect(f.send()).rejects.toThrow('injected failure');
    expect(f.attempts()).toBe(10);
    expect(f.store()).toEqual({receipts:[],messages:[],events:[]});
    expect(f.trace.some(t=>t.startsWith('refresh:'))).toBe(false);
});

test('isolated inbound: live recipient synchronization happens only after commit', async()=>{
    const f=fixture();
    f.ctx.state.agent.recipient={id:'recipient',messages:[],events:[]};
    await f.send();
    expect(f.trace.indexOf('sync:recipient')).toBeGreaterThan(f.trace.indexOf('commit'));
    expect(f.ctx.state.agent.recipient.messages).toHaveLength(1);
    expect(f.ctx.state.agent.recipient.events).toHaveLength(1);
    expect(f.trace).not.toContain('sync:sender');
});

test('isolated inbound: sender projection never writes transcript/cursor or replaces in-flight messages', async()=>{
    const f=fixture(); await f.send();
    expect(f.writes.filter(w=>w.sql.startsWith('INSERT INTO messages')).map(w=>w.params[0])).toEqual(['recipient']);
    expect(f.writes.some(w=>/last_processed_msg_idx/.test(w.sql))).toBe(false);
    expect(f.sender.lastProcessedMsgIdx).toBe(42);
    expect(f.store().events.filter(e=>e.agent_id==='sender')).toHaveLength(1);
    expect(f.sender.messages).toBe(f.inflight);
    expect(f.trace).not.toContain('getMessages:sender');
});
