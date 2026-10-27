import { expect, test } from 'bun:test';
import inject from './injectScheduledPrompt';

test('scheduled injection only adds UI metadata and preserves transcript append contract', async () => {
    const calls: Record<string, unknown>[] = [];
    const ctx = { state: { agent: {} }, fns: {
        procs: { db: { transaction: async ({ fn }: { fn: () => Promise<unknown> }) => fn(), select: async () => [{ id: 'test', stopped_at: null }], run: async () => {} } },
        session: { appendUserMessage: async (opts: Record<string, unknown>) => { calls.push(opts); return { idx: 7 }; } },
        events: { refreshAgentMeta: () => {} }, agent: { wakeWorker: () => {} },
    } } as unknown as Context;
    expect(await inject(ctx, null, { agentId: 'test', text: ' prompt ', scheduleId: 'daily' })).toEqual({ agentId: 'test', messageIdx: 7, scheduled: true });
    expect(calls[0]).toEqual({ id: 'test', text: 'prompt', eventExtra: { automationKind: 'scheduled', scheduleId: 'daily' } });
    await inject(ctx, null, { agentId: 'test', text: 'prompt' });
    expect(calls[1]).toEqual({ id: 'test', text: 'prompt', eventExtra: { automationKind: 'scheduled' } });
});
test('stopped agent does not append scheduled UI event or prompt', async () => {
    let appended = false;
    const ctx = { fns: {
        procs: { db: { transaction: async ({ fn }: { fn: () => Promise<unknown> }) => fn(), select: async () => [{ id: 'test', stopped_at: 1 }] } },
        session: { appendUserMessage: async () => { appended = true; return { idx: 1 }; } },
    } } as unknown as Context;
    expect(await inject(ctx, null, { agentId: 'test', text: 'prompt' })).toEqual({ agentId: 'test', messageIdx: null, scheduled: false, reason: 'stopped' });
    expect(appended).toBe(false);
});
