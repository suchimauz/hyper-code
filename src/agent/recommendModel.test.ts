import { describe, expect, test } from 'bun:test';
import recommend from './recommendModel';

function fixture() {
    const calls: any[] = [];
    const state = { enabled: true, catalog: ['mock/work:alpha', 'mock:beta'], denied: [] as string[], unavailable: [] as string[], answer: { type: 'choice', choice: 'c0', confidence: 0.9, probabilities: { abstain: 0.1, c0: 0.9 } } as any };
    const ctx: any = { fns: {
        agent: { current: async () => ({ id: 'caller' }) },
        procs: { db: { select: async () => [{ jev_model_routing_enabled: state.enabled }] } },
        llm: {
            listModels: async () => { calls.push('catalog'); return { mock: state.catalog }; },
            modelPolicy: async ({model}: any) => { if (state.denied.includes(model)) throw Error('disabled'); },
            resolveEndpoint: async ({model}: any) => { if (state.unavailable.includes(model)) throw Error('unavailable'); return { apiKey: 'SECRET', account: 'PRIVATE' }; },
        },
        jev: { decide: async (opts: any) => { calls.push(opts); return { answers: { model: state.answer }, usage: {inputTokens: 10, outputTokens: 3, cost: 0.001} }; } },
    } };
    const run = (opts: any = {}) => recommend(ctx, null, {task: 'Explain a short function', allowedModels: ['mock/work:alpha'], ...opts});
    return { state, calls, ctx, run };
}
describe('advisory Jev model recommendation (no network)', () => {
    test('disabled never discovers catalog or calls Jev', async () => { const f=fixture(); f.state.enabled=false; expect((await f.run()).reason).toBe('disabled'); expect(f.calls).toEqual([]); });
    test('sessionless abstains', async () => { const f=fixture(); f.ctx.fns.agent.current=async()=>{throw Error('no session');}; expect((await f.run()).reason).toBe('no-current-agent'); });
    test('valid allowlisted recommendation; no credentials/account labels; bounded timeout and retries', async () => { const f=fixture(); const r=await f.run(); expect(r.id).toBe('mock/work:alpha'); expect(r.usage?.inputTokens).toBe(10); expect(r.latencyMs).toBeGreaterThanOrEqual(0); const wire=f.calls[1]; expect(wire.timeoutMs).toBeLessThanOrEqual(3000); expect(wire.retries).toBe(0); expect(JSON.stringify(wire)).not.toMatch(/SECRET|PRIVATE|work/); expect(wire.questions.model.instructions).toContain('untrusted'); });
    test('reject invalid and oversized inputs before discovery', async () => { for (const opts of [{task:'x'.repeat(4001)}, {allowedModels:[]}, {allowedModels:Array(21).fill('mock:a')}, {allowedModels:['bare']}, {task:''}]) {const f=fixture(); expect((await f.run(opts)).reason).toBe('invalid-input'); expect(f.calls).toEqual([]);} });
    test('mandatory unknown capabilities abstain without discovery', async () => {for(const opts of [{requireTools:true},{requireVision:true},{minContextTokens:1000},{privacy:'local-only'}]){const f=fixture();expect((await f.run(opts)).reason).toBe('unverifiable-required-capability');expect(f.calls).toEqual([]);}});
    test('catalog/policy/availability intersection', async () => {for(const kind of ['catalog','denied','unavailable'] as const){const f=fixture();if(kind==='catalog')f.state.catalog=[];else f.state[kind]=['mock/work:alpha'];expect((await f.run()).reason).toBe('no-eligible-candidates');expect(f.calls.length).toBe(1);}});
    test('same model across accounts is ambiguous without sending aliases', async () => {const f=fixture();f.state.catalog.push('mock/personal:alpha');expect((await f.run({allowedModels:f.state.catalog.filter(x=>x.endsWith(':alpha'))})).reason).toBe('ambiguous-candidates');});
    test('bare local catalogue IDs qualify only within their provider group', async () => {const f=fixture();f.ctx.fns.llm.listModels=async()=>({lmstudio:['alpha']});expect((await f.run({allowedModels:['lmstudio:alpha']})).id).toBe('lmstudio:alpha');expect((await f.run({allowedModels:['mock:alpha']})).reason).toBe('no-eligible-candidates');});
    test('duplicates deduplicated', async () => {const f=fixture();expect((await f.run({allowedModels:['mock/work:alpha','mock/work:alpha']})).id).toBe('mock/work:alpha');});
    test('strict distributions and confidence', async () => {for(const answer of [{choice:'outside'}, {confidence:NaN}, {probabilities:{abstain:0.2,c0:0.9}}, {probabilities:{abstain:0,c0:1,extra:0}}, {probabilities:{c0:1}}, {probabilities:{abstain:-0.1,c0:1.1}}]){const f=fixture();Object.assign(f.state.answer,answer);expect((await f.run()).reason).toBe('invalid-response');}});
    test('ties and low confidence abstain', async () => {for(const answer of [{confidence:0.59},{probabilities:{abstain:0.5,c0:0.5}}]){const f=fixture();Object.assign(f.state.answer,answer);expect((await f.run()).reason).toBe('ambiguous-response');}});
    test('hung Jev is bounded below three seconds', async () => {const f=fixture();f.ctx.fns.jev.decide=()=>new Promise(()=>{});const start=performance.now();expect((await f.run()).reason).toBe('provider-unavailable');expect(performance.now()-start).toBeLessThan(3000);}, 4000);
    test('provider abstention and failure', async () => {const f=fixture();f.state.answer={type:'choice',choice:'abstain',confidence:0.9,probabilities:{abstain:0.9,c0:0.1}};expect((await f.run()).reason).toBe('provider-abstained');f.ctx.fns.jev.decide=async()=>{throw Error('provider');};expect((await f.run()).reason).toBe('provider-unavailable');});
});
