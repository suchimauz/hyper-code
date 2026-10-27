import { describe, test, expect } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';

describe('web transient stream', () => {
    test('mount, escaped refresh, repeated replacement and final clearing preserve durable offsets', async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: 'mock:test' });
        await ctx.fns.session.save({ agent });
        agent.scratchpad.mobileStream = { text: '<script>unsafe</script> partial', revision: 1, startedAt: Date.now() };
        const initial = await ctx.fns.ui.chatColumn({ agentId: agent.id });
        expect(initial.match(/id="msg-stream"/g)).toHaveLength(1);
        expect(initial).toContain('&lt;script&gt;unsafe&lt;/script&gt; partial');
        for (let i = 0; i < 2; i++) {
            const response = await ctx.fns.procs.http.dispatch({ url: `/agent/${agent.id}/stream.html` });
            const html = await response.text();
            expect(html.match(/id="msg-stream"/g)).toHaveLength(1);
            expect(html).toContain('data-streaming-message');
            expect(html).toContain('data-stream-activity');
            expect(html).toContain('class="chat-stream-dot"');
            expect(html).toContain(`data-live-topic="agent:${agent.id}:stream"`);
            expect(html).not.toContain('<script>');
        }
        expect(await ctx.fns.session.getEvents({ id: agent.id })).toHaveLength(0);
        expect(await ctx.fns.session.getMessages({ id: agent.id })).toHaveLength(0);
        delete agent.scratchpad.mobileStream;
        await ctx.fns.session.appendEvent({ id: agent.id, event: { type: 'assistant', text: 'final answer' } });
        const final = await (await ctx.fns.procs.http.dispatch({ url: `/agent/${agent.id}/events.html?offset=0` })).text();
        expect(final).toContain('final answer');
        expect(final).toContain('offset=1');
        expect(final).toContain('hx-swap-oob="outerHTML"');
        expect(final).not.toContain('Streaming response');
        expect(final).not.toContain('unsafe');
        const older = await (await ctx.fns.procs.http.dispatch({ url: `/agent/${agent.id}/events.html?before=1` })).text();
        expect(older).not.toContain('msg-stream');
    });
    test('run coalesces tokens and immediately clears failures and cancellation', async () => {
        for (const cancel of [false, true]) {
            const ctx: any = await mkTestCtx();
            const agent = await ctx.fns.agent.start({ model: 'mock:test' });
            await ctx.fns.session.save({ agent });
            const notices: any[] = [];
            ctx.fns.procs.events.emit = (_c: any, _s: any, opts: any) => { if (opts.topic === `agent:${agent.id}:stream`) notices.push(opts); };
            ctx.fns.llm.stream = async (_c: any, _s: any, opts: any) => {
                for (let i = 0; i < 100; i++) opts.onEvent({ type: 'text_delta', delta: 'x' });
                expect(notices).toHaveLength(0);
                await Bun.sleep(390);
                expect(notices).toHaveLength(1);
                expect(agent.scratchpad.mobileStream.text).toHaveLength(100);
                if (cancel) {
                    agent.abortController.abort('test');
                    expect(agent.scratchpad.mobileStream).toBeUndefined();
                    expect(notices).toHaveLength(2);
                }
                throw new Error('failed test stream');
            };
            await ctx.fns.agent.run({ agent, userText: 'test' }).catch(() => {});
            expect(agent.scratchpad.mobileStream).toBeUndefined();
            const events = await ctx.fns.session.getEvents({ id: agent.id });
            expect(events.some((e: any) => String(e.text ?? '').includes('xxxxxxxx'))).toBe(false);
        }
    });
});
