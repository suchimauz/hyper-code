import { describe, expect, test } from 'bun:test';
import call from './call';

// Deliberately isolated from _testCtx and its database/runtime preload.
function setup() {
    const run = { id: 'unit', controller: new AbortController(), aborted: false, startedAt: Date.now(), tail: '' };
    const tool = { key: 'unit', name: 'unit', wireName: 'unit', fn: 'sample.handler', parameters: {}, validate: '' };
    let invocations = 0;
    let ended = 0;
    const ctx = {
        session: null,
        fns: {
            tools: {
                list: () => [tool],
                validate: () => ({ ok: true, errors: [] as string[] }),
                beginRun: () => run,
                endRun: () => { ended++; },
            },
            sample: {
                handler: (_args: object): unknown => { invocations++; return 'ok'; },
                validator: async (_opts: object): Promise<string[]> => [],
            },
            procs: {},
        },
    };
    return { ctx, tool, run, invoke: (name = 'unit') => call(ctx as unknown as Context, null, { name, args: {} }), invocations: () => invocations, ended: () => ended };
}

describe('tools.call handler invocation accounting', () => {
    test('unknown tool does not execute', async () => {
        const s = setup();
        expect(await s.invoke('unknown')).toMatchObject({ isError: true, handlerExecuted: false });
        expect(s.invocations()).toBe(0);
    });
    test('schema rejection does not execute', async () => {
        const s = setup();
        s.ctx.fns.tools.validate = () => ({ ok: false, errors: ['invalid'] });
        expect(await s.invoke()).toMatchObject({ output: 'Error: invalid arguments for unit — invalid', isError: true, handlerExecuted: false });
        expect(s.invocations()).toBe(0);
    });
    test('custom validator rejection does not execute', async () => {
        const s = setup();
        s.tool.validate = 'sample.validator';
        s.ctx.fns.sample.validator = async () => ['rejected'];
        expect(await s.invoke()).toMatchObject({ output: 'Error: invalid arguments for unit — rejected', isError: true, handlerExecuted: false });
        expect(s.invocations()).toBe(0);
    });
    test('missing validator does not execute', async () => {
        const s = setup();
        s.tool.validate = 'sample.missing';
        expect(await s.invoke()).toMatchObject({ isError: true, handlerExecuted: false });
        expect(s.invocations()).toBe(0);
    });
    test('validator exceptions still propagate without invoking handler', async () => {
        const s = setup();
        s.tool.validate = 'sample.validator';
        s.ctx.fns.sample.validator = async () => { throw new Error('validator failed'); };
        await expect(s.invoke()).rejects.toThrow('validator failed');
        expect(s.invocations()).toBe(0);
    });
    test('missing implementation does not execute and ends run', async () => {
        const s = setup();
        s.tool.fn = 'sample.missing';
        expect(await s.invoke()).toMatchObject({ isError: true, handlerExecuted: false });
        expect(s.ended()).toBe(1);
    });
    test('success executes handler and preserves output', async () => {
        const s = setup();
        expect(await s.invoke()).toEqual({ output: 'ok', isError: false, handlerExecuted: true });
        expect(s.invocations()).toBe(1);
        expect(s.ended()).toBe(1);
    });
    test('synchronous throw counts as executed', async () => {
        const s = setup();
        s.ctx.fns.sample.handler = () => { throw new Error('failed'); };
        expect(await s.invoke()).toEqual({ output: 'Error: failed', isError: true, handlerExecuted: true });
    });
    test('async rejection counts as executed', async () => {
        const s = setup();
        s.ctx.fns.sample.handler = async () => { throw new Error('failed async'); };
        expect(await s.invoke()).toEqual({ output: 'Error: failed async', isError: true, handlerExecuted: true });
    });
    test('terminal envelope preserves content and scrubs NUL', async () => {
        const s = setup();
        const content = [{ type: 'text', text: 'body' }];
        const terminal = { type: 'html', html: '<p>done</p>', text: 'done' };
        s.ctx.fns.sample.handler = () => ({ output: 'a\u0000b', content, terminal });
        expect(await s.invoke()).toEqual({ output: 'a\uFFFDb', content, terminal, isError: false, handlerExecuted: true });
    });
    test('error envelope still counts as executed', async () => {
        const s = setup();
        s.ctx.fns.sample.handler = () => ({ output: 'rejected by handler', isError: true });
        expect(await s.invoke()).toEqual({ output: 'rejected by handler', isError: true, handlerExecuted: true });
    });
    test('pre-invocation cancellation does not execute', async () => {
        const s = setup();
        s.run.aborted = true;
        s.run.controller.abort('stopped');
        expect(await s.invoke()).toMatchObject({ isError: true, handlerExecuted: false });
        expect(s.invocations()).toBe(0);
    });
    test('cancellation after invocation does not claim handler was unexecuted', async () => {
        const s = setup();
        s.ctx.fns.sample.handler = () => {
            s.run.aborted = true;
            s.run.controller.abort('stopped');
            return new Promise(() => {});
        };
        const result = await s.invoke();
        expect(result).toMatchObject({ isError: true, handlerExecuted: true });
        expect(result.output).toContain('the result is unknown');
        expect(s.ended()).toBe(1);
    });
});
