import { expect, test } from 'bun:test';
import recommend from './recommendExecutor';

function fixture() {
    const calls: any[] = [];
    const queries: any[] = [];
    const data: any = { enabled: true, rows: [{ id: 'child', title: 'TypeScript reviewer', transcript: 'SECRET' }], answer: { type: 'choice', choice: 'c0', confidence: 0.9, probabilities: { c0: 0.9, abstain: 0.1 } } };
    const ctx: any = { fns: { agent: { current: async () => ({ id: 'caller' }) }, procs: { db: { select: async (q: any) => { queries.push(q); return q.sql.includes('SELECT jev_') ? [{ jev_agent_routing_enabled: data.enabled }] : data.rows; } } }, jev: { decide: async (q: any) => { calls.push(q); if(data.error) throw Error('private provider error'); if(data.hang) return new Promise(() => {}); return { answers: { executor: data.answer }, usage: { inputTokens: 10, outputTokens: 2, cost: 0.001 } }; } } } };
    return { ctx, data, calls, queries, run: (opts: any = { task: 'Review types', allowedIds: ['child'] }) => recommend(ctx, null, opts) };
}

test('disabled and absent session make no provider calls', async () => {
    const f=fixture();f.data.enabled=false;expect((await f.run()).reason).toBe('disabled');expect(f.calls).toHaveLength(0);
    f.ctx.fns.agent.current=async()=>{throw Error('no session');};expect((await f.run()).reason).toBe('no-current-agent');expect(f.calls).toHaveLength(0);
});
test('caller scope, explicit allowlist, opaque titles only and no side effects', async () => {
    const f=fixture();const out=await f.run();expect(out.id).toBe('child');expect(out.usage?.inputTokens).toBe(10);
    expect(f.queries[1].params).toEqual(['caller','child']);expect(f.queries[1].sql).toContain("parent_id = ? AND visibility = 'team' AND archived_at IS NULL");
    const payload=JSON.stringify(f.calls);expect(payload).not.toContain('SECRET');expect(payload).not.toContain('child');expect(payload).not.toContain('caller');expect(f.calls[0].timeoutMs).toBeLessThanOrEqual(3000);expect(f.calls[0].retries).toBe(0);
    expect(out.probabilities).toEqual({child:0.9,__abstain__:0.1});
});
test('missing, archived, foreign, duplicate rows and ambiguous titles abstain', async () => {
    for(const rows of [[],[{id:'foreign',title:'Other'}],[{id:'child',title:''}],[{id:'child',title:'X'},{id:'child',title:'X'}]]) {const f=fixture();f.data.rows=rows;expect((await f.run()).id).toBeNull();expect(f.calls).toHaveLength(0);}
    const f=fixture();f.data.rows=[{id:'child',title:'Same'},{id:'other',title:'same'}];expect((await f.run({task:'x',allowedIds:['child','other']})).reason).toBe('ambiguous-candidate');
});
test('input bounds and duplicate explicit IDs', async () => {
    for(const ids of [undefined,[],[''],['x'.repeat(129)],Array(21).fill('child'),[3]]) { const f=fixture();expect((await f.run({task:'x',allowedIds:ids})).id).toBeNull();expect(f.calls).toHaveLength(0); }
    const f=fixture();expect((await f.run({task:'x',allowedIds:['child','child']})).id).toBe('child');expect(f.queries[1].params).toEqual(['caller','child']);
    f.data.rows[0].title='x'.repeat(1000);expect((await f.run({task:'x'.repeat(10000),allowedIds:['child']})).reason).toBe('invalid-input');expect(f.calls).toHaveLength(1);await f.run({task:'x'.repeat(4000),allowedIds:['child']});expect(f.calls[1].state.task.length).toBe(4000);expect(f.calls[1].questions.executor.criteria.c0.length).toBe(240);
});
test('hallucinated choice and malformed confidence/probabilities fail closed', async () => {
    for(const patch of [{choice:'child'},{choice:'c99'},{choice:'__proto__'},{confidence:2},{confidence:NaN},{probabilities:{c0:1.1,abstain:-0.1}},{probabilities:{c0:0.5}},{probabilities:{c0:0.5,abstain:0.1}},{type:'text'}]) {const f=fixture();Object.assign(f.data.answer,patch);expect((await f.run()).reason).toBe('invalid-response');}
});
test('explicit abstain and transport errors do not dispatch or leak errors', async () => {
    const f=fixture();f.data.answer.choice='abstain';expect((await f.run()).reason).toBe('provider-abstained');f.data.error=true;const out=await f.run();expect(out.reason).toBe('provider-unavailable');expect(JSON.stringify(out)).not.toContain('private');
});
test('hung provider is bounded under three seconds', async () => {
    const f=fixture();f.data.hang=true;const out=await f.run();expect(out.reason).toBe('provider-unavailable');expect(out.latencyMs).toBeLessThan(3000);
});

test('low confidence and tied distributions abstain with usage', async()=>{for(const patch of [{confidence:0.4},{probabilities:{c0:0.5,abstain:0.5}}]){const f=fixture();Object.assign(f.data.answer,patch);const out=await f.run();expect(out.reason).toBe('ambiguous-response');expect(out.usage?.inputTokens).toBe(10);}});
