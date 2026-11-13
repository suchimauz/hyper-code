import { expect, test } from 'bun:test';
import run from './run';
test('hook isolation is opt-in and reports failures only after invoking all handlers', async () => {
    const calls: string[] = [];
    const ctx: any = { state: { procs: { hooks: { points: { fixture: {} }, handlers: { fixture: new Map([
        ['first', async () => { calls.push('first'); throw new Error('fixture failure'); }],
        ['second', async () => { calls.push('second'); return 2; }],
    ]) } } } } };
    await expect(run(ctx, null, { name: 'fixture' })).rejects.toThrow('fixture failure');
    expect(calls).toEqual(['first']); calls.length = 0;
    await expect(run(ctx, null, { name: 'fixture', isolateFailures: true })).rejects.toBeInstanceOf(AggregateError);
    expect(calls).toEqual(['first', 'second']);
});
