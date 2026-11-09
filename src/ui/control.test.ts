import { describe, test, expect } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';

// Full procs registry ctx; the agent/session/files fns the control helpers
// lean on are replaced with raw `(ctx, session, opts)` stubs, and emitted
// events are captured via the real procs event bus.
const mkCtx = async () => {
  const ctx: any = await mkTestCtx();
  const reg = ctx.state.registry;
  reg.agent.start = (c: any, _s: any, opts: any) => {
    const agent = { id: 'test', model: opts.model, systemPrompt: opts.systemPrompt, tools: opts.tools, events: [], messages: [], scratchpad: {}, isStreaming: false };
    (c.state.agent ??= {})[agent.id] = agent;
    return agent;
  };
  reg.agent.systemPrompt = async () => 'default system';
  reg.agent.run = async (_c: any, _s: any, opts: any) => {
    opts.agent.events.push({ type: 'assistant', text: 'ok:' + opts.userText });
  };
  reg.session.save = () => {};
  reg.settings.getString = (_c: any, _s: any, _o: any) => undefined;
  reg.files.resolveSafe = (_c: any, _s: any, opts: { path: string }) => opts.path;
  reg.files.open = (c: any, _s: any, opts: { path: string }) => { ((c.state as any).openedFiles ??= []).push(opts.path); };
  const emitted: any[] = [];
  ctx.fns.procs.events.subscribe({ handler: (e: any) => emitted.push(e) });
  return { ctx, emitted };
};

describe('ui control helpers', () => {
  test('createAgent creates and optionally opens agent', async () => {
    const { ctx, emitted } = await mkCtx();
    const res = await ctx.fns.ui.createAgent({ model: 'x:test', open: true });
    expect(res.id).toBe('test');
    expect(emitted[0]).toEqual({ type: 'ui.navigate', path: '/agent/test' });
  });

  test('sendToAgent queues run and emits navigate when requested', async () => {
    const { ctx, emitted } = await mkCtx();
    const agent = await ctx.fns.agent.start({ model: 'x:test', systemPrompt: '' });
    const res = await ctx.fns.ui.sendToAgent({ agentId: agent.id, text: 'hello', open: true });
    expect(res.agentId).toBe(agent.id);
    expect(emitted[0]).toEqual({ type: 'ui.navigate', path: '/agent/test' });
  });

  test('notify emits ui.notify event', async () => {
    const { ctx, emitted } = await mkCtx();
    await ctx.fns.ui.notify({ message: 'hi', level: 'warn' });
    expect(emitted[0].type).toBe('ui.notify');
  });

  test('openFile resolves, records and navigates to the Files screen', async () => {
    const { ctx, emitted } = await mkCtx();
    const res = await ctx.fns.ui.openFile({ path: 'src/x.ts' });
    expect(res.opened).toBe('src/x.ts');
    expect(res.url).toBe('/files/absolute/src/x.ts');
    expect((ctx.state as any).openedFiles).toEqual(['src/x.ts']);
    expect(emitted[0]).toEqual({ type: 'ui.navigate', path: '/files/absolute/src/x.ts' });
  });

  test('native secure-input metadata is owner-filtered JSON, never a popup fragment', async () => {
    const { ctx } = await mkCtx();
    ctx.state.registry.auth.currentUser = async (_c: any, _s: any, { req }: any) => ({ required: true, user: { id: req.headers.get('x-test-user') ?? 'owner' } });
    ctx.state.registry.auth.csrfToken = async () => 'fixture-csrf';
    ctx.state.secureInput = { prompts: new Map([['p1', {
      id: 'p1', name: 'test-1', title: 'Test', message: 'Enter', kind: 'text', maxlength: 20,
      ownerId: 'owner', expiresAt: Date.now() + 60_000, resolve: () => {}, reject: () => {},
    }]]) };
    expect((await ctx.fns.secureInput.current({})).status).toBe(403);
    const res = await ctx.fns.procs.http.dispatch({ url: '/secureInput/current' });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const data = await res.json();
    expect(data.csrfToken).toBe('fixture-csrf');
    expect(data.prompt).toEqual({ id: 'p1', name: 'test-1', title: 'Test', message: 'Enter', kind: 'text', maxlength: 20, expiresAt: ctx.state.secureInput.prompts.get('p1').expiresAt });
    const hidden = await ctx.fns.secureInput.current({ req: new Request('http://localhost/secureInput/current', { headers: { 'x-test-user': 'other' } }) });
    expect(await hidden.json()).toEqual({ prompt: null });
  });

  test('native secure-input answers require protected HTTP and cancellation settles the prompt', async () => {
    const { ctx } = await mkCtx();
    const answers: string[] = [], errors: string[] = [];
    ctx.state.registry.auth.currentUser = async () => ({ required: true, user: { id: 'owner' } });
    ctx.state.registry.auth.verifyCsrf = async (_c: any, _s: any, { token }: any) => token === 'fixture-csrf';
    const entry = () => ({ id: 'p1', ownerId: 'owner', kind: 'text', maxlength: 20, expiresAt: Date.now() + 60_000, resolve: (value: string) => answers.push(value), reject: (error: Error) => errors.push(error.message) });
    ctx.state.secureInput = { prompts: new Map([['p1', entry()]]) };
    const submit = (body: object, token = 'fixture-csrf') => ctx.fns.procs.http.dispatch({ method: 'POST', url: '/secureInput/submit', headers: { 'content-type': 'application/json', 'x-csrf-token': token }, body: JSON.stringify(body) });
    expect((await ctx.fns.secureInput.submit({})).status).toBe(403);
    expect((await submit({ id: 'p1', value: 'fixture-value' }, 'bad')).status).toBe(403);
    expect((await submit({ id: 'stale', value: 'fixture-value' })).status).toBe(404);
    expect(answers).toEqual([]);
    const accepted = await submit({ id: 'p1', value: 'fixture-value' });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ ok: true });
    expect(answers).toEqual(['fixture-value']);
    expect(ctx.state.secureInput.prompts.size).toBe(0);
    ctx.state.secureInput.prompts.set('p1', entry());
    expect((await submit({ id: 'p1', cancel: true })).status).toBe(200);
    expect(errors).toEqual(['transient input prompt cancelled']);
    expect(ctx.state.secureInput.prompts.size).toBe(0);
  });

});
