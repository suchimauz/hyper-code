import { test, expect } from 'bun:test';
import stop from './stop';
import pause from '../goal/lifecyclePause';

function fixture({ enabled = true, replacement = false, idle = false } = {}) {
    const controller = new AbortController();
    const agent: any = { id: 'a', currentJobId: idle ? null : 'old', abortController: controller, samplingAbortController: null, scratchpad: { goal: { goalId: 'untrusted' } } };
    const calls: string[] = [];
    const row = { id: 'a', run_token: idle ? null : 'old', scratchpad: '{}' };
    let active = false;
    let goalStatus = 'active';
    const ctx: any = { state: { procs: { db: { transactionStorage: { getStore: () => ({ active }) } } } }, fns: {
        goal: {
            runStopPrepare: async () => { expect(active).toBe(false); return {kind:'absent'}; },
            runStopApply: async () => { expect(active).toBe(false); },
            enabled: async () => enabled,
            lifecyclePause: (opts: any) => { expect(active).toBe(true); return pause(ctx, null, opts); },
            read: async () => { calls.push('read-goal'); return { enabled: true, goal: { goalId: 'g', revision: 2, status: goalStatus } }; },
            transition: async ({ current }: any) => ({ ...current, status: 'paused', revision: 3 }),
        },
        procs: { db: {
            transaction: async ({ fn }: any) => {
                expect(active).toBe(false); expect(controller.signal.aborted).toBe(true);
                if (replacement) row.run_token = 'new';
                active = true;
                try { return await fn(); } finally { active = false; }
            },
            select: async ({ sql }: any) => { expect(active).toBe(true); expect(sql).toContain('FOR UPDATE'); return [row]; },
            run: async ({ sql }: any) => {
                if (sql.startsWith('SET LOCAL lock_timeout')) return { changes: 0 };
                if (sql.startsWith('UPDATE agent_goals')) { calls.push('pause'); goalStatus = 'paused'; expect(row.run_token).toBe(idle ? null : 'old'); }
                else if (sql.startsWith('INSERT INTO goal_transition_events')) calls.push('audit');
                else { calls.push('revoke'); row.run_token = null; }
                return { changes: 1 };
            },
        } },
        tools: { runs: () => [], abortRun: () => {} },
        session: { appendErrorEvent: async () => {}, syncAgentState: async () => {} },
        events: { refreshAgentMeta: () => {} },
    } };
    return { ctx, agent, calls, status: () => goalStatus };
}

test('gate-off Stop preserves revoke without goal reads or writes', async () => {
    const f = fixture({ enabled: false });
    expect(await stop(f.ctx, null, { agent: f.agent })).toEqual({ ok: true, clearQueue: true });
    expect(f.calls).toEqual(['revoke']);
});
test('active Stop pauses and audits in owner transaction before token revoke', async () => {
    const f = fixture();
    await stop(f.ctx, null, { agent: f.agent });
    expect(f.calls).toEqual(['read-goal', 'pause', 'audit', 'revoke']);
});
test('stale captured Stop token cannot pause replacement goal', async () => {
    const f = fixture({ replacement: true });
    await stop(f.ctx, null, { agent: f.agent });
    expect(f.calls).toEqual(['revoke']);
    expect(f.status()).toBe('active');
});
test('idle Stop intentionally pauses current goal inside owner transaction', async () => {
    const f = fixture({ idle: true });
    await stop(f.ctx, null, { agent: f.agent, clearQueue: false });
    expect(f.calls).toEqual(['read-goal', 'pause', 'audit', 'revoke']);
});

test('ready snapshot flushes before pause/revoke and applies only after commit', async () => {
 const f=fixture();f.ctx.fns.goal.runStopPrepare=async()=>({kind:'ready',goalId:'g',snapshot:{runToken:'old'}});
 f.ctx.fns.goal.accountingCheckpointTx=async()=>{f.calls.push('checkpoint');return {revision:4};};
 f.ctx.fns.goal.runStopApply=async({result}:any)=>{expect(result.revision).toBe(4);expect(f.calls.at(-1)).toBe('revoke');f.calls.push('apply');};
 await stop(f.ctx,null,{agent:f.agent});expect(f.calls).toEqual(['checkpoint','read-goal','pause','audit','revoke','apply']);
});
test('checkpoint failure rolls back and retries stop without ledger or result apply', async () => {
 const f=fixture();let attempts=0;const transaction=f.ctx.fns.procs.db.transaction;
 f.ctx.fns.procs.db.transaction=async(o:any)=>{attempts++;return transaction(o);};
 f.ctx.fns.goal.runStopPrepare=async()=>({kind:'ready',goalId:'g',snapshot:{}});
 f.ctx.fns.goal.accountingCheckpointTx=async()=>{f.calls.push('checkpoint-failed');throw Error('ledger unavailable');};
 f.ctx.fns.goal.runStopApply=async({result}:any)=>expect(result).toBeUndefined();
 let diagnostic='';f.ctx.fns.session.appendErrorEvent=async({error}:any)=>{diagnostic=error;};
 await stop(f.ctx,null,{agent:f.agent});expect(attempts).toBe(2);expect(f.calls.filter(x=>x==='revoke')).toHaveLength(1);expect(diagnostic).toContain('not exact');
});
test('incomplete snapshot skips ledger and reports diagnostic; changed goal not paused', async () => {
 const f=fixture();f.ctx.fns.goal.runStopPrepare=async()=>({kind:'blocked',goalId:'old-goal',reason:'pending request'});
 f.ctx.fns.goal.accountingCheckpointTx=()=>{throw Error('must not flush');};let diagnostic='';
 f.ctx.fns.session.appendErrorEvent=async({error}:any)=>{diagnostic=error;};
 await stop(f.ctx,null,{agent:f.agent});expect(f.calls).toEqual(['read-goal','revoke']);expect(diagnostic).toContain('incomplete');
});

test('goal pause SQL failure cannot prevent baseline durable Stop',async()=>{const f=fixture();f.ctx.fns.goal.lifecyclePause=async()=>{throw Error('goal schema missing');};let diagnostic='';f.ctx.fns.session.appendErrorEvent=async({error}:any)=>{diagnostic=error;};await stop(f.ctx,null,{agent:f.agent});expect(f.calls).toEqual(['revoke']);expect(f.agent.abortController).toBeNull();expect(diagnostic).toContain('goal schema missing');});
test('postcommit apply failure still clears owned controller and reports diagnostic',async()=>{const f=fixture();f.ctx.fns.goal.runStopApply=async()=>{throw Error('local registry failed');};let diagnostic='';f.ctx.fns.session.appendErrorEvent=async({error}:any)=>{diagnostic=error;};await stop(f.ctx,null,{agent:f.agent});expect(f.agent.abortController).toBeNull();expect(f.agent.currentJobId).toBeNull();expect(diagnostic).toContain('local registry failed');});
test('baseline Stop SQL errors propagate rather than being swallowed',async()=>{const f=fixture({enabled:false});f.ctx.fns.procs.db.run=async()=>{throw Error('agents write failed');};await expect(stop(f.ctx,null,{agent:f.agent})).rejects.toThrow('agents write failed');});

function descendant(f: ReturnType<typeof fixture>) {
    const authority = { rootAgentId: 'root', goalId: 'g', sourceAgentId: 'a', sourceRunId: 'old', capabilityId: 'cap', allowContinuation: false };
    f.ctx.fns.goal.runStopPrepare = async () => ({ kind: 'ready', goalId: 'g', authority,
        snapshot: { agentId: 'root', sourceAgentId: 'a', runToken: 'old', authority } });
    return authority;
}
test('descendant Stop locks accounting root before child and never pauses root', async () => {
    const f = fixture(); const authority = descendant(f);
    f.ctx.fns.procs.db.select = async ({params}: any) => { f.calls.push('lock:' + params[0]); return [{scratchpad:'{}'}]; };
    f.ctx.fns.goal.lifecyclePause = async () => { throw Error('descendant must not pause'); };
    f.ctx.fns.goal.accountingCheckpointTx = async (snapshot: any) => {
        expect(snapshot.authority).toBe(authority); f.calls.push('checkpoint'); return {revision:4};
    };
    await stop(f.ctx, null, {agent:f.agent});
    expect(f.calls).toEqual(['lock:root','lock:a','checkpoint','revoke']);
});
test('missing authority does not bill root inferred from snapshot or parent_id', async () => {
    const f = fixture(); f.agent.parentId = 'root';
    f.ctx.fns.goal.runStopPrepare = async () => ({kind:'ready',goalId:'g',snapshot:{agentId:'root',sourceAgentId:'a'}});
    f.ctx.fns.goal.accountingCheckpointTx = async () => { throw Error('false billing'); };
    await stop(f.ctx,null,{agent:f.agent}); expect(f.calls).toEqual(['revoke']);
});
test('root lock failure rolls back and bounded fallback skips every Goal operation', async () => {
    const f = fixture(); descendant(f); const select = f.ctx.fns.procs.db.select;
    let attempts = 0; let rollbacks = 0; let bounds = 0;
    const transaction = f.ctx.fns.procs.db.transaction;
    f.ctx.fns.procs.db.transaction = async (opts:any) => { attempts++; try { return await transaction(opts); } catch(error) { rollbacks++; throw error; } };
    f.ctx.fns.procs.db.select = async (opts:any) => { if(opts.params[0]==='root') throw Error('lock timeout'); return select(opts); };
    const run = f.ctx.fns.procs.db.run;
    f.ctx.fns.procs.db.run = async (opts:any) => { if(opts.sql.startsWith('SET LOCAL lock_timeout')) bounds++; return run(opts); };
    f.ctx.fns.goal.lifecyclePause = async () => { throw Error('must skip'); };
    f.ctx.fns.goal.runStopApply = async ({result}:any) => { expect(result).toBeUndefined(); };
    await stop(f.ctx,null,{agent:f.agent});
    expect(attempts).toBe(2); expect(rollbacks).toBe(1); expect(bounds).toBe(2); expect(f.calls).toEqual(['revoke']);
});
test('prepare failure performs bounded baseline Stop without Goal bookkeeping', async () => {
    const f = fixture(); f.ctx.fns.goal.runStopPrepare = async () => { throw Error('registry unavailable'); };
    f.ctx.fns.goal.lifecyclePause = async () => { throw Error('must skip'); };
    await stop(f.ctx,null,{agent:f.agent}); expect(f.calls).toEqual(['revoke']);
});
test('fallback child lock errors propagate, rather than unbounded retry', async () => {
    const f = fixture(); descendant(f); let locks = 0;
    f.ctx.fns.procs.db.select = async () => { locks++; throw Error(locks===1?'root unavailable':'child lock timeout'); };
    await expect(stop(f.ctx,null,{agent:f.agent})).rejects.toThrow('child lock timeout'); expect(locks).toBe(2);
});
