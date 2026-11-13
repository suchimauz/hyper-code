import { expect, test, spyOn } from 'bun:test';
import start from './$start';
import stop from './$stop';

test('startup sweeps immediately; concurrent and hot-reloaded starts keep one hourly timer; stop permits restart', async () => {
    let runs = 0; const logs: any[] = [];
    const ctx: any = { state: {}, fns: { gitUi: { sweepArchived: async () => { runs++; return { deleted: 0 }; } }, procs: { log: { warn: (entry: any) => logs.push(entry) } } } };
    try {
        await Promise.all([start(ctx, null, {}), start(ctx, null, {})]);
        const timer = ctx.state.gitUi.archivedSweepTimer;
        expect(runs).toBe(1); expect(timer).toBeDefined();
        const reloadPath = './$start.ts?reload=fixture';
        const reloaded = (await import(reloadPath)).default;
        await reloaded(ctx, null, {});
        expect(ctx.state.gitUi.archivedSweepTimer).toBe(timer); expect(runs).toBe(1);
        await stop(ctx, null, {}); expect(ctx.state.gitUi.archivedSweepTimer).toBeUndefined();
        ctx.fns.gitUi.sweepArchived = async () => { runs++; throw new Error('fixture cleanup failure'); };
        await start(ctx, null, {});
        expect(runs).toBe(2); expect(logs[0].msg).toBe('fixture cleanup failure');
        expect(ctx.state.gitUi.archivedSweepTimer).toBeDefined();
    } finally { await stop(ctx, null, {}); }
});

test('hourly callback uses the current runtime function and logs failures without losing registration', async () => {
    let tick: () => Promise<void> = async () => {}; let delay = 0; let runs = 0;
    const logs: any[] = []; const timer = { unref() {} };
    const spy = spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => Promise<void>, ms: number) => { tick = fn; delay = ms; return timer; }) as any);
    const ctx: any = { state: {}, fns: { gitUi: { sweepArchived: async () => { runs++; } }, procs: { log: { warn: (entry: any) => logs.push(entry) } } } };
    try {
        await start(ctx, null, {}); expect(delay).toBe(3600000); expect(runs).toBe(1);
        ctx.fns.gitUi.sweepArchived = async () => { runs += 10; throw new Error('hourly failure'); };
        await tick(); expect(runs).toBe(11); expect(logs[0].msg).toBe('hourly failure');
        await start(ctx, null, {}); expect(spy).toHaveBeenCalledTimes(1);
        ctx.fns.gitUi.sweepArchived = async () => { runs++; };
        await tick(); expect(runs).toBe(12); expect(ctx.state.gitUi.archivedSweepTimer).toBe(timer);
    } finally { spy.mockRestore(); }
});
