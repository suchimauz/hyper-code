import { describe, test, expect } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';

describe('web transient stream', () => {
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
