import { afterEach, expect, spyOn, test } from 'bun:test';
import version from './claudeCodeCliVersion';
import compact from './compactAnthropic';
import stream from './streamAnthropic';

let spawn: ReturnType<typeof spyOn> | undefined;
afterEach(() => spawn?.mockRestore());
function context() {
    const descriptors: Record<string, any> = { a: { host: 'one', pinnedHostKey: 'pin1' }, b: { host: 'two', pinnedHostKey: 'pin2' } };
    const calls: string[][] = [];
    const ctx: any = { env: {}, state: {}, fns: { sshInstance: {
        get: async ({name}: any) => descriptors[name],
        connection: async ({name}: any) => ({ bin: 'ssh', args: ['-T'], host: descriptors[name].host }),
    } } };
    spawn = spyOn(Bun, 'spawn').mockImplementation(((argv: string[]) => {
        calls.push(argv);
        const value = argv[0] === 'claude' ? '1.2.3' : argv[2] === 'one' ? '2.3.4' : '3.4.5';
        return { stdout: new Blob([`${value} (Claude Code)\n`]).stream(), exited: Promise.resolve(0), kill: () => {} };
    }) as any);
    return {ctx, descriptors, calls};
}
test('local and two SSH destinations isolated; concurrent probes deduplicated; descriptor/pin change invalidates', async () => {
    const {ctx, descriptors, calls} = context();
    expect(await version(ctx, null, {})).toBe('1.2.3');
    expect(await Promise.all(Array.from({length: 5}, () => version(ctx, null, {instance: 'a'})))).toEqual(Array(5).fill('2.3.4'));
    expect(await version(ctx, null, {instance: 'b'})).toBe('3.4.5');
    expect(calls).toHaveLength(3);
    expect(calls[1].at(-1)).toContain('$HOME/.local/bin');
    expect(calls[1].at(-1)).toContain('timeout -k 1s 8s claude --version');
    descriptors.a.pinnedHostKey = 'replacement';
    await version(ctx, null, {instance: 'a'});
    expect(calls).toHaveLength(4);
    descriptors.a.host = 'two';
    expect(await version(ctx, null, {instance: 'a'})).toBe('3.4.5');
    expect(calls).toHaveLength(5);
});
test('explicit override applies to both local and SSH without reading descriptors', async () => {
    const {ctx, calls} = context();
    ctx.env.CLAUDE_CODE_CLI_VERSION = ' 9.8.7 ';
    ctx.fns.sshInstance.get = () => { throw Error('must not read'); };
    expect(await version(ctx, null, {})).toBe('9.8.7');
    expect(await version(ctx, null, {instance: 'a'})).toBe('9.8.7');
    expect(calls).toHaveLength(0);
});
test('malformed output, timeout exit and excessive output use cached fallback, never local CLI', async () => {
    for (const [output, code] of [['wrong 9.9.9', 0], ['2.3.4 (Claude Code)', 124], ['x'.repeat(4097), 0]] as const) {
        const {ctx, calls} = context();
        let killed = false;
        spawn!.mockImplementation(((argv: string[]) => {
            calls.push(argv);
            return {stdout: new Blob([output]).stream(), exited: Promise.resolve(code), kill: () => { killed = true; }};
        }) as any);
        expect(await version(ctx, null, {instance:'a'})).toBe('2.1.260');
        expect(await version(ctx, null, {instance:'a'})).toBe('2.1.260');
        expect(calls).toHaveLength(1);
        expect(calls[0][0]).toBe('ssh');
        expect(killed).toBe(true);
        spawn!.mockRestore();
    }
});
test('local deadline kills and reaps a stalled SSH probe', async () => {
    const {ctx} = context();
    let controller: ReadableStreamDefaultController<Uint8Array>;
    let finish: (code: number) => void;
    let killed = false;
    const exited = new Promise<number>(resolve => { finish = resolve; });
    spawn!.mockImplementation((() => ({
        stdout: new ReadableStream<Uint8Array>({start(c) {controller = c;}}),
        exited,
        kill: () => { if (!killed) { killed = true; controller.close(); finish(137); } },
    })) as any);
    // Fire the 12 s local deadline immediately instead of waiting for it.
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: any, ms?: number, ...rest: any[]) => realSetTimeout(fn, ms === 12_000 ? 1 : ms, ...rest)) as any;
    try { expect(await version(ctx, null, {instance:'a'})).toBe('2.1.260'); }
    finally { globalThis.setTimeout = realSetTimeout; }
    expect(killed).toBe(true);
    expect(await exited).toBe(137);
}, 15000);

test('stream and compact choose endpoint SSH identity and use its version in UA (offline)', async () => {
    for (const mode of ['stream', 'compact']) {
        let selected: any; let headers: any;
        const ctx: any = {env:{}, state:{}, fns: {
            agent: {buildLlmRequest: async () => ({system:'sys', messages:[]}), wireTools: () => [], cacheRoot: async () => 'test'},
            llm: {
                resolveEndpoint: async () => ({provider:'claude-code', api:'anthropic', apiKey:'not-used', modelId:'claude-test', ssh:{instance:'remote-b', provider:'claude-code',account:'default'},url:'https://unused.invalid'}),
                resolveReasoningEffort: async () => ({mode:'none'}),
                toAnthropicMessages: () => [],
                claudeCodeCliVersion: async (opts:any) => {selected = opts; return '9.8.7';},
            },
            sshAccount: {fetch: async ({init}:any) => {headers=init.headers; throw Error('offline stop');}},
        }};
        try {
            if (mode === 'compact') await compact(ctx, null, {model:'ssh:test', messages:[]});
            else await stream(ctx, null, {agent:{id:'test',model:'ssh:test',messages:[],scratchpad:{}} as any});
        } catch (e) { expect((e as Error).message).toBe('offline stop'); }
        expect(selected).toEqual({instance:'remote-b'});
        expect(headers['user-agent']).toBe('claude-cli/9.8.7 (external, sdk-cli)');
    }
});
