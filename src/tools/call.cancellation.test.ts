import { expect, test } from 'bun:test';
import call from './call';

function fixture(signal: AbortSignal, invoke: () => Promise<string>) {
    let ended = 0;
    const run = { id: 'test', controller: new AbortController(), aborted: false, startedAt: Date.now(), tail: '' };
    const ctx: any = { runSignal: signal, fns: {
        tools: {
            list: () => [{ name: 'fixture', wireName: 'fixture', fn: 'fixture.invoke', parameters: {} }],
            validate: () => ({ ok: true }), beginRun: () => run,
            endRun: () => { ended++; },
        },
        fixture: { invoke }, procs: {},
    } };
    return { ctx, run, ended: () => ended };
}

test('already stopped run never invokes tool', async () => {
    const ac = new AbortController(); ac.abort('stopped_by_user');
    let invoked = 0;
    const f = fixture(ac.signal, async () => { invoked++; return 'unexpected'; });
    const result = await call(f.ctx, null, { name: 'fixture' });
    expect(invoked).toBe(0);
    expect(result.isError).toBe(true);
    expect(f.ended()).toBe(1);
});

test('immutable parent signal cancels active tool and cleans registry', async () => {
    const ac = new AbortController();
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    let release!: (s: string) => void;
    const f = fixture(ac.signal, () => { started(); return new Promise(resolve => { release = resolve; }); });
    const running = call(f.ctx, null, { name: 'fixture' });
    await ready;
    ac.abort('stopped_by_user');
    const result = await running;
    expect(f.run.controller.signal.aborted).toBe(true);
    expect(result.output).toContain('result is unknown');
    expect(result.isError).toBe(true);
    expect(f.ended()).toBe(1);
    // Cooperative cancellation does not pretend to interrupt arbitrary eval.
    release('late result');
});
