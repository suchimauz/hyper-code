import { describe, test, expect } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';

async function owned(ctx: any) {
    const agent = await ctx.fns.agent.start({ model: 'lmstudio:test' });
    for (let i = 0; i < 12; i++) await ctx.fns.session.appendMessage({ id: agent.id, message: { role: i % 2 ? 'assistant' : 'user', content: `${i}:` + 'x'.repeat(16000) } });
    await ctx.fns.session.syncAgentState({ agent });
    agent.abortController = new AbortController();
    agent.activeRunCount = 1;
    agent.currentJobId = 'owner';
    await ctx.fns.procs.db.run({ sql: "UPDATE agents SET run_state = 'running', run_token = ? WHERE id = ?", params: ['owner', agent.id] });
    return agent;
}

describe('owned mid-turn compaction', () => {
    test('keeps ownership, root transcript and complete tool batch intact', async () => {
        const ctx: any = await mkTestCtx();
        const agent = await owned(ctx);
        await ctx.fns.session.appendMessage({ id: agent.id, message: { role: 'assistant', content: '', tool_calls: [{ id: 'effect', name: 'write', args: {} }] } });
        await ctx.fns.session.appendMessage({ id: agent.id, message: { role: 'tool', content: 'already done', tool_call_id: 'effect' } });
        const before = await ctx.fns.session.getMessages({ id: agent.id });
        ctx.state.registry.llm.call = () => ({ text: 'summary', usage: {} });
        const result = await ctx.fns.agent.compactContext({ agent, runToken: 'owner', signal: agent.abortController.signal });
        expect(result.status).toBe('compacted');
        expect(await ctx.fns.session.getMessages({ id: agent.id })).toEqual(before);
        const [row] = await ctx.fns.procs.db.select({ sql: 'SELECT run_state, run_token FROM agents WHERE id = ?', params: [agent.id] });
        expect(row).toMatchObject({ run_state: 'running', run_token: 'owner' });
        const req = await ctx.fns.agent.buildLlmRequest({ agent });
        expect(req.messages.some((m: any) => m.tool_call_id === 'effect')).toBe(true);
        expect(req.messages.some((m: any) => m.tool_calls?.some((c: any) => c.id === 'effect'))).toBe(true);
    });
    for (const change of ['edit', 'token', 'head', 'growth']) test(`rejects concurrent ${change}`, async () => {
        const ctx: any = await mkTestCtx();
        const agent = await owned(ctx);
        ctx.state.registry.llm.call = async () => {
            if (change === 'edit') await ctx.fns.session.updateMessageContent({ id: agent.id, idx: 0, content: 'changed' });
            if (change === 'token') await ctx.fns.procs.db.run({ sql: 'UPDATE agents SET run_token = ? WHERE id = ?', params: ['other', agent.id] });
            if (change === 'head') await ctx.fns.procs.db.run({ sql: "UPDATE agents SET sleep_context = jsonb_set(sleep_context, '{activeRevision}', '99') WHERE id = ?", params: [agent.id] });
            return { text: change === 'growth' ? 'z'.repeat(250000) : 'summary', usage: {} };
        };
        expect((await ctx.fns.agent.compactContext({ agent, runToken: 'owner', signal: agent.abortController.signal })).status).toBe('stale');
        if (change === 'head') expect(agent.sleepContext.activeRevision).toBe(99);
    });
    test('abort returns promptly even when provider ignores signal, never activates late result', async () => {
        const ctx: any = await mkTestCtx();
        const agent = await owned(ctx);
        const ac = agent.abortController;
        let finish!: (v: any) => void;
        ctx.state.registry.llm.call = () => new Promise(resolve => { finish = resolve; ac.abort(); });
        await expect(ctx.fns.agent.compactContext({ agent, runToken: 'owner', signal: ac.signal })).rejects.toThrow();
        expect(agent.sleepContext.activeRevision).toBeNull();
        finish({ text: 'too late', usage: {} });
        await Bun.sleep(5);
        expect(agent.sleepContext.activeRevision).toBeNull();
    });
    test('failed compaction is attempted once across many tool batches without replay', async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: 'mock:test' });
        agent.scratchpad.mockLLM = { turns: Array.from({ length: 4 }, () => ({ toolCalls: [{ name: 'read', args: { path: 'x' } }] })), defaultText: 'done' };
        await ctx.fns.session.save({ agent });
        let effects = 0, attempts = 0;
        ctx.state.registry.files.read = () => { effects++; return 'finished'; };
        ctx.state.registry.agent.autoCompactIfNeeded = async (_c: any, _s: any, o: any) => {
            const messages = await ctx.fns.session.getMessages({ id: agent.id });
            expect(messages.filter((m: any) => m.role === 'tool').every((m: any) => m.content === 'finished')).toBe(true);
            if (!o.checkOnly) attempts++;
            return { status: o.checkOnly ? 'over_threshold' : 'failed', estimatedTokens: 10000, contextWindow: 200000 };
        };
        await ctx.fns.agent.run({ agent, userText: 'go' });
        expect(effects).toBe(4);
        expect(attempts).toBe(1);
    });
    test('hard budget guard pauses before any provider or tool replay', async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: 'mock:test' });
        let calls = 0;
        ctx.state.registry.llm.stream = () => { calls++; throw new Error('must not sample'); };
        ctx.state.registry.agent.autoCompactIfNeeded = (_c: any, _s: any, o: any) => ({ status: o.checkOnly ? 'over_threshold' : 'failed', estimatedTokens: 195000, contextWindow: 200000 });
        await ctx.fns.agent.run({ agent, userText: 'go' });
        expect(calls).toBe(0);
        expect((await ctx.fns.session.getMessages({ id: agent.id })).at(-1).content).toContain('Paused');
    });
});
