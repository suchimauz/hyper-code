import { describe, test, expect } from 'bun:test';
import { makeCtx } from '../$main';
const build = (await import('./buildLlmRequest')).default;
const prompt = (await import('../goal/promptContext')).default;

function fixture() {
    const ctx: any = makeCtx();
    let enabled = false;
    let goal: any = null;
    const own: any[] = [{ role: 'user', idx: 2, message_type: 'goal_continuation', content: 'queued synthetic' }, { role: 'user', idx: 3, content: 'human request' }];
    const inherited = [{ role: 'user', idx: 2, message_type: 'goal_continuation', content: 'inherited same idx' }];
    const projections: any[] = [];
    ctx.state.registry = {
        agent: { buildLlmRequest: build, fullSystemPrompt: async () => 'stable bootstrap', selectJevContext: async (_c: any, _s: any, o: any) => o.messages },
        planning: { prompt: async () => '' },
        goal: { read: async () => ({ enabled, goal }), promptContext: prompt },
        session: { getFullMessages: async (_c: any, _s: any, o: any) => o.id === 'parent' ? inherited : [...inherited, ...own], getMessages: async () => own, repairToolPairs: (_c: any, _s: any, o: any) => ({ messages: o.messages, repaired: [] }) },
        procs: { db: { select: async () => [{ parent_id: 'parent', fork_offset: 1 }] } },
        compaction: { project: async (_c: any, _s: any, o: any) => { projections.push(o); return { messages: o.sleepContext ? [{ role: 'user', content: 'summary includes queued synthetic' }] : o.messages, mode: o.sleepContext ? 'compact' : 'full', fallback: null, revision: null }; } },
        llm: { resolveEndpoint: async () => ({ provider: 'openai' }), stream: async (c: any, _s: any, o: any) => { await Promise.resolve(); return c.fns.agent.buildLlmRequest({ agent: o.agent }); } },
        auth: { attributeMessages: async (_c: any, _s: any, o: any) => ({ applied: false, messages: o.messages }) },
        attachments: { resolveContent: async (_c: any, _s: any, o: any) => o.messages },
    };
    const agent: any = { id: 'child', parentId: 'parent', model: 'openai:test', messages: own };
    const scoped: any = Object.create(ctx);
    scoped.session = { agentId: agent.id };
    scoped.goalRequestContext = Object.freeze({ agentId: agent.id, omitGoalContinuationIdxs: Object.freeze([2]) });
    return { ctx, scoped, agent, own, projections, setGoal: (e: boolean, g: any) => { enabled = e; goal = g; } };
}
const text = (r: any) => r.messages.map((m: any) => m.content).join('\n');
describe('goal outgoing request context (offline)', () => {
    test('immutable task frontier filters late own input on every adapter rebuild before projection', async () => {
        const h = fixture();
        h.scoped.goalRequestContext = Object.freeze({agentId:'child',omitGoalContinuationIdxs:[],authority:Object.freeze({authorizedThroughIdx:2})});
        h.agent.sleepContext = {checkpoint:true};
        h.own.splice(0,h.own.length,{role:'user',idx:2,content:'authorized task'},
            {role:'assistant',idx:3,content:'own output'}, {role:'tool',idx:4,content:'own tool'});
        expect(text(await h.scoped.fns.llm.stream({agent:h.agent}))).toContain('authorized task');
        h.own.push({role:'user',idx:6,content:'late human'}, {role:'user',idx:7,excluded_from_cursor:true,content:'excluded injection'}, {role:'user',content:'missing index injection'});
        const out = text(await h.scoped.fns.llm.stream({agent:h.agent}));
        expect(out).toContain('own output'); expect(out).toContain('own tool'); expect(out).toContain('inherited same idx');
        expect(out).not.toContain('late human'); expect(out).not.toContain('injection');
        expect(h.projections.every(p=>p.sleepContext===null)).toBe(true);
        expect(JSON.stringify(h.projections)).not.toContain('injection');
        expect(h.own).toHaveLength(6);
    });
    test('descendant request without exact frontier fails closed', async () => {
        const h=fixture(); h.scoped.goalRequestContext={agentId:'child',omitGoalContinuationIdxs:[],authority:{}};
        await expect(h.scoped.fns.llm.stream({agent:h.agent})).rejects.toThrow('missing authorized task frontier');
        expect(h.projections).toHaveLength(0);
    });
    test('disabled no suppression leaves outgoing history and bootstrap unchanged', async () => {
        const h = fixture(); const before = JSON.stringify(h.own);
        const out = await h.ctx.fns.agent.buildLlmRequest({ agent: h.agent });
        // The independent planning control-plane now appends one request-only row.
        expect(out.messages).toHaveLength(6); expect(out.bootstrapMessageCount).toBe(2);
        expect(out.messages.at(-1)).toMatchObject({role:'user',content:'',excluded_from_cursor:true});
        expect(text(out)).not.toContain('Authoritative current goal'); expect(JSON.stringify(h.own)).toBe(before);
    });
    test('mixed human suppression preserves inherited equal idx and never mutates durable history', async () => {
        const h = fixture(); const before = JSON.stringify(h.own);
        const out = await h.scoped.fns.agent.buildLlmRequest({ agent: h.agent });
        expect(text(out)).not.toContain('queued synthetic'); expect(text(out)).toContain('human request'); expect(text(out)).toContain('inherited same idx');
        expect(JSON.stringify(h.own)).toBe(before);
        h.own.push({ role: 'user', idx: 4, content: 'refreshed human' });
        expect(text(await h.scoped.fns.agent.buildLlmRequest({ agent: h.agent }))).toContain('refreshed human');
    });
    test('suppression bypasses a checkpoint that summarized synthetic instructions', async () => {
        const h = fixture(); h.agent.sleepContext = { checkpoint: true };
        const out = await h.scoped.fns.agent.buildLlmRequest({ agent: h.agent });
        expect(h.projections[0].sleepContext).toBeNull(); expect(text(out)).not.toContain('summary includes'); expect(out.context.mode).toBe('full');
    });
    test('real dispatch Proxy preserves isolated scopes during concurrent provider calls', async () => {
        const h = fixture(); const other: any = Object.create(h.ctx);
        other.goalRequestContext = Object.freeze({ agentId: 'other', omitGoalContinuationIdxs: Object.freeze([]) });
        const [filtered, normal] = await Promise.all([h.scoped.fns.llm.stream({ agent: h.agent }), other.fns.llm.stream({ agent: { ...h.agent, id: 'other' } })]);
        expect(text(filtered)).not.toContain('queued synthetic'); expect(text(normal)).toContain('queued synthetic');
        expect(Object.hasOwn(h.ctx, 'goalRequestContext')).toBe(false);
    });
    test('goal context is never rendered per request; it travels as persisted goal_context rows', async () => {
        const h = fixture(); h.setGoal(true, { goalId: 'g', revision: 1, status: 'active', objective: 'obj', tokenBudget: null, tokensUsed: 0 });
        const first = await h.scoped.fns.agent.buildLlmRequest({ agent: h.agent });
        expect(text(first)).not.toContain('Authoritative current goal');
        h.setGoal(true, { goalId: 'g', revision: 2, status: 'active', objective: 'obj', tokenBudget: null, tokensUsed: 900 });
        expect((await h.scoped.fns.agent.buildLlmRequest({ agent: h.agent })).messages).toEqual(first.messages);
    });
});
