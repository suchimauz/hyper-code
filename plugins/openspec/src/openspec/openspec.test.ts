import { test, expect } from 'bun:test';
import { mkdir, mkdtemp, writeFile, readdir, stat, symlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
// Tests load raw procedures deliberately to keep fixtures isolated from live sessions.
const load = async (p: string) => (await import(p)).default;
const root = resolve(import.meta.dir, '../../../..');

async function setup() {
    const base = resolve(root, '.mauzcode/tmp/openspec-tests'); await mkdir(base, { recursive: true });
    const dir = await mkdtemp(base + '/ws-');
    const ctx: any = { fns: { openspec: {}, agent: {}, markdown: {}, procs: { db: {} } }, state: {} };
    for (const name of ['run', 'snapshot', 'document', 'validateAll']) { const fn = await load(import.meta.dir + '/' + name + '.ts'); ctx.fns.openspec[name] = (o: any) => fn(ctx, null, o); }
    const sanitize = await load(root + '/src/agent/sanitizeHtmlBody.ts'); ctx.fns.agent.sanitizeHtmlBody = (o: any) => sanitize(ctx, null, o);
    const render = await load(root + '/src/markdown/render.ts'); ctx.fns.markdown.render = (o: any) => render(ctx, null, o);
    return { ctx, dir, os: join(dir, '.mauzcode', 'openspec') };
}
const put = async (file: string, text: string) => { await mkdir(resolve(file, '..'), { recursive: true }); await writeFile(file, text); };
const spec = (then = true) => `# Spec\n\n## Purpose\n\nPurpose text that is long enough for strict validation rules.\n\n## ADDED Requirements\n\n### Requirement: Login\nThe system SHALL let a user log in.\n\n#### Scenario: Valid login\n- **WHEN** the user submits valid credentials\n${then ? '- **THEN** the user is logged in\n' : ''}`;

async function fixture(os: string) {
    await put(join(os, 'config.yaml'), 'schema: spec-driven\n');
    const c = join(os, 'changes', 'add-login');
    await put(join(c, 'proposal.md'), '# Proposal\n\n## Why\n\nBecause **login**.\n\n## What Changes\n\n- Add login\n');
    await put(join(c, 'tasks.md'), '## 1\n\n- [x] 1.1 a\n- [x] 1.2 b\n- [x] 1.3 c\n- [ ] 1.4 d\n- [ ] 1.5 e\n- [ ] 1.6 f\n- [ ] 1.7 g\n- [ ] 1.8 h\n');
    await put(join(c, 'specs', 'user-auth', 'spec.md'), spec());
    await put(join(c, 'specs', 'user-session', 'spec.md'), spec());
    await put(join(os, 'changes', 'no-tasks', 'proposal.md'), '# Proposal\n');
    await put(join(os, 'specs', 'billing', 'spec.md'), '# Billing\n\nCurrent spec.\n');
    await put(join(os, 'changes', 'archive', '2030-01-01-old', 'proposal.md'), '# Old\n');
    await put(join(os, 'changes', 'archive', '2031-02-02-newer', 'proposal.md'), '# Newer\n');
}

test('canvas kind pins a local workspace and refuses SSH', async () => {
    const kind = await load(import.meta.dir + '/$canvas_workspace.ts');
    const ctx = (row: any) => ({ fns: { procs: { db: { select: async () => [row] } } } });
    expect((await kind.prepare(ctx({ workspace_dir: '/home/u/proj', workspace_host: null }), { agentId: 'a', args: {} })).args).toEqual({ dir: '/home/u/proj' });
    expect((await kind.prepare(ctx({ workspace_dir: '/home/u/proj', workspace_host: 'local' }), { agentId: 'a', args: {} })).args).toEqual({ dir: '/home/u/proj' });
    await expect(kind.prepare(ctx({ workspace_dir: '/home/u/proj', workspace_host: 'box' }), { agentId: 'a', args: {} })).rejects.toThrow(/local/);
    await expect(kind.prepare(ctx({ workspace_dir: 'relative', workspace_host: '' }), { agentId: 'a', args: {} })).rejects.toThrow(/absolute/);
});

test('snapshot: progress, missing artifacts, spec deltas, specs and archive order', async () => {
    const { ctx, dir, os } = await setup(); await fixture(os);
    const s = await ctx.fns.openspec.snapshot({ dir });
    expect(s.initialized).toBe(true);
    expect(s.key).toMatch(/^[a-f0-9]{16}$/);
    const login = s.changes.find((c: any) => c.name === 'add-login');
    expect(`${login.progress.done}/${login.progress.total}`).toBe('3/8');
    const ids = login.artifacts.map((a: any) => a.id);
    expect(ids).toEqual(['change:add-login:proposal', 'change:add-login:tasks', 'change:add-login:spec:user-auth', 'change:add-login:spec:user-session']);
    expect(ids.some((i: string) => i.endsWith(':design'))).toBe(false);
    const noTasks = s.changes.find((c: any) => c.name === 'no-tasks');
    expect(noTasks.progress).toBeNull();
    expect(s.changes.map((c: any) => c.name)).not.toContain('archive');
    expect(s.specs).toEqual([{ id: 'spec:billing', path: 'billing' }]);
    expect(s.archive.map((c: any) => c.name)).toEqual(['2031-02-02-newer', '2030-01-01-old']);
    expect(JSON.stringify(s)).not.toContain(dir);
});

test('snapshot: uninitialized workspace is reported and left unchanged', async () => {
    const { ctx, dir } = await setup();
    const s = await ctx.fns.openspec.snapshot({ dir });
    expect(s).toMatchObject({ initialized: false, changes: [], specs: [], archive: [] });
    expect(await readdir(dir)).toEqual([]);
    await expect(ctx.fns.openspec.snapshot({ dir: 'rel' })).rejects.toThrow(/absolute/);
});

test('document: renders proposal, rejects escapes and missing documents', async () => {
    const { ctx, dir, os } = await setup(); await fixture(os);
    const d = await ctx.fns.openspec.document({ dir, id: 'change:add-login:proposal' });
    expect(d.title).toBe('add-login/proposal.md');
    expect(d.html).toContain('<strong>login</strong>');
    expect((await ctx.fns.openspec.document({ dir, id: 'change:add-login:spec:user-auth' })).html).toContain('Login');
    expect((await ctx.fns.openspec.document({ dir, id: 'spec:billing' })).html).toContain('Current spec');
    expect((await ctx.fns.openspec.document({ dir, id: 'archive:2030-01-01-old:proposal' })).html).toContain('Old');
    for (const id of ['spec:../../../etc', 'change:..:proposal', 'change:add-login:../x', 'change:add-login:spec:a/../../b', 'file:/etc/passwd', 'change:archive:proposal', 'change:a/b:proposal'])
        await expect(ctx.fns.openspec.document({ dir, id })).rejects.toThrow(/invalid document id/);
    await writeFile(join(dir, 'secret.md'), '# secret\n');
    await mkdir(join(os, 'specs', 'leak'), { recursive: true });
    await symlink(join(dir, 'secret.md'), join(os, 'specs', 'leak', 'spec.md'));
    await expect(ctx.fns.openspec.document({ dir, id: 'spec:leak' })).rejects.toThrow(/outside/);
    await expect(ctx.fns.openspec.document({ dir, id: 'change:add-login:design' })).rejects.toThrow(/not found/);
    await put(join(os, 'specs', 'huge', 'spec.md'), 'a'.repeat(1024 * 1024 + 1));
    await expect(ctx.fns.openspec.document({ dir, id: 'spec:huge' })).rejects.toThrow(/1 MB/);
});

async function tree(p: string): Promise<string[]> {
    const out: string[] = [];
    for (const e of await readdir(p, { withFileTypes: true, recursive: true })) { const f = join((e as any).parentPath ?? (e as any).path, e.name); out.push(f + ':' + (await stat(f)).mtimeMs); }
    return out.sort();
}

test('validateAll: passing fixture, failing scenario without THEN, no file changes', async () => {
    const { ctx, dir, os } = await setup();
    const c = join(os, 'changes', 'add-login');
    await put(join(os, 'config.yaml'), 'schema: spec-driven\n');
    await put(join(c, 'proposal.md'), '# Proposal\n\n## Why\n\nUsers need to log in to reach their personal data safely and quickly.\n\n## What Changes\n\n- Add login\n\n## Capabilities\n\n### New Capabilities\n\n- `user-auth`: login\n');
    await put(join(c, 'tasks.md'), '## 1\n\n- [ ] 1.1 a\n');
    await put(join(c, 'specs', 'user-auth', 'spec.md'), spec(true));
    const before = await tree(os);
    const ok = await ctx.fns.openspec.validateAll({ dir });
    expect(ok.items.find((i: any) => i.id === 'add-login')).toMatchObject({ type: 'change', valid: true, issues: [] });
    expect(ok.ok).toBe(true);
    expect(await tree(os)).toEqual(before);
    await put(join(c, 'specs', 'user-auth', 'spec.md'), spec(false));
    const bad = await ctx.fns.openspec.validateAll({ dir });
    expect(bad.ok).toBe(false);
    const item = bad.items.find((i: any) => i.id === 'add-login');
    expect(item.valid).toBe(false);
    expect(item.issues.length).toBeGreaterThan(0);
    expect(item.issues.map((i: any) => i.message).join('\n')).toMatch(/THEN|scenario/i);
}, 120000);
