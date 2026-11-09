import { describe, expect, test } from 'bun:test';
import read from './initialPromptRead';

function fixture(who: any, owner: string | null | undefined) {
  const calls: string[] = [];
  const prompt = '# Exact\n<script>alert("x")</script>\n${literal}\n';
  const ctx: any = { state: { agent: {} }, fns: {
    auth: { currentUser: async () => who },
    procs: { db: { select: async () => owner === undefined ? [] : [{ created_by: owner }] } },
    session: { load: async ({ id }: any) => { calls.push('load'); return { id, title: '<title>' }; } },
    agent: { fullSystemPrompt: async () => { calls.push('prompt'); return prompt; } },
  } };
  return { ctx, calls, prompt };
}
const req = new Request('http://localhost/agent/aa/initialPrompt');
describe('native initial prompt owner boundary', () => {
  test('owner receives exact literal full prompt JSON without interpretation', async () => {
    const f = fixture({ required: true, user: { id: 'alice' } }, 'alice');
    const response = await read(f.ctx, null, { req, agentId: 'aa' });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ agentId: 'aa', title: '<title>', prompt: f.prompt, characters: f.prompt.length, estimatedTokens: Math.ceil(f.prompt.length / 4) });
  });
  for (const [label, who, owner, status] of [
    ['another owner', { required: true, user: { id: 'bob' } }, 'alice', 404],
    ['unauthenticated', { required: true, user: null, legacy: false }, 'alice', 401],
    ['legacy named owner', { required: true, user: null, legacy: true }, 'alice', 404],
    ['open named owner', { required: false, user: null }, 'alice', 404],
    ['missing', { required: true, user: { id: 'alice' } }, undefined, 404],
  ] as const) test(`denies ${label} before loading or assembling`, async () => {
    const f = fixture(who, owner);
    const response = await read(f.ctx, null, { req, agentId: 'aa' });
    expect(response.status).toBe(status); expect(f.calls).toEqual([]);
  });
  test('ownerless open installation retains read-only access', async () => {
    const f = fixture({ required: false, user: null }, null);
    expect((await read(f.ctx, null, { req, agentId: 'aa' })).status).toBe(200);
  });
  test('malformed id never loads agent', async () => {
    const f = fixture({ required: false, user: null }, null);
    expect((await read(f.ctx, null, { req, agentId: '../aa' })).status).toBe(404);
    expect(f.calls).toEqual([]);
  });
});
