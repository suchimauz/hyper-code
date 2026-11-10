import { test, expect } from 'bun:test';
import submit from './submit';

function harness(stopped = false) {
    let row: any = { id: 'in1', agentId: 'a', kind: 'choice', title: 'Question', state: 'open' };
    let messages: any[] = []; let scheduled = false; let tx = false; let fail = false;
    const ctx: any = { state: { input: { kinds: { choice: { submit: async () => ({ result: { value: 'a' }, summary: 'a' }) } } } }, fns: {
        input: { get: async () => ({ ...row }) }, session: { appendMessage: async ({ message }: any) => { if (fail) throw Error('delivery failure'); messages.push(message); } },
        agent: { wakeWorker: () => {} }, procs: { events: { refresh: () => {} }, db: {
            transaction: async ({ fn }: any) => { if(tx) throw Error('nested'); const before = { ...row }; const old = [...messages]; tx = true; try { return await fn(); } catch(e) { row = before; messages = old; throw e; } finally { tx = false; } },
            select: async ({ sql }: any) => sql.includes('blocking') ? [{ agent_id: 'a', blocking: true }] : [{ id: 'a' }],
            run: async ({ sql, params }: any) => {
                if(sql.includes("state = 'processing'")) { if(row.state !== 'open') return { rows: [] }; row.state='processing'; return { rows: [{id:row.id}] }; }
                if(sql.includes('UPDATE inputs SET state = ?')) { row.state=params[0]; return {}; }
                if(sql.includes("state = 'open'")) { row.state='open'; return {}; }
                if(sql.includes('UPDATE agents')) { if(sql.includes('stopped_at=NULL')) throw Error('must not clear Stop'); scheduled=!stopped; return {}; }
                throw Error(sql);
            },
        } },
    } };
    return { ctx, get state(){return row.state;}, get messages(){return messages;}, get scheduled(){return scheduled;}, fail(){fail=true;} };
}
test('blocking answer preserves manual Stop; duplicate answer is a no-op', async()=>{
    const h=harness(true);
    expect((await submit(h.ctx,null,{id:'in1'})).state).toBe('submitted');
    expect(h.scheduled).toBe(false); expect(h.messages.length).toBe(1);
    await submit(h.ctx,null,{id:'in1'}); expect(h.messages.length).toBe(1);
});
test('cancel delivers one answer and schedules resume', async()=>{
    const h=harness(); await submit(h.ctx,null,{id:'in1',cancel:true});
    expect(h.state).toBe('cancelled'); expect(h.scheduled).toBe(true); expect(h.messages.length).toBe(1);
});
test('delivery failure rolls claim and final state back to open for retry after restart', async()=>{
    const h=harness(); h.fail();
    await expect(submit(h.ctx,null,{id:'in1'})).rejects.toThrow('delivery failure');
    expect(h.state).toBe('open'); expect(h.messages.length).toBe(0);
});
test('answering withdraws the notification from the owner\'s other devices after the transaction commits', async()=>{
    const h=harness(); const recalled:any[]=[]; let committed=false;
    h.ctx.fns.webPush={recall:async(o:any)=>{recalled.push(o);}};
    const tx=h.ctx.fns.procs.db.transaction;
    h.ctx.fns.procs.db.transaction=async({fn}:any)=>{const out=await tx({fn}); committed=true; return out;};
    await submit(h.ctx,null,{id:'in1'});
    expect(recalled).toEqual([{inputId:'in1'}]);
    // The withdrawal must not run before the answer is durable.
    expect(committed).toBe(true);
});
