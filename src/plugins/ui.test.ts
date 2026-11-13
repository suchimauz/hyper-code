import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import compile from './uiCompile';
import manifest from './uiManifest';
import approve from './$route_ui_approve_POST';
import bundle from './$route_ui_$name_$file_GET';

async function plugin(ui: object, files: Record<string, string>) {
    const dir = await mkdtemp(join(tmpdir(), 'mauzcode-ui-'));
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'demo', procs: { src: 'src', ui } }));
    for (const [rel, text] of Object.entries(files)) { await mkdir(join(dir, rel, '..'), { recursive: true }); await writeFile(join(dir, rel), text); }
    return dir;
}
function context(dir: string, source = 'user', rows: unknown[] = []) {
    const state: Record<string, unknown> = {};
    const ctx = { state, fns: {
        procs: { modules: { list: () => [{ name: 'demo', dir, plugin: true, source, namespaces: ['demo'] }] }, db: { select: async () => rows }, events: { emit: () => {} } },
    } } as unknown as Context;
    (ctx.fns as any).plugins = { uiCompile: (o: any) => compile(ctx, null, o), uiBuildAll: async () => { await compile(ctx, null, { name: 'demo' }); return { built: [], failed: [], changed: false }; }, uiManifest: () => manifest(ctx, null, {}) };
    return ctx;
}
const view = `import { Panel } from '@mauzcode/ui';\nimport { helper } from './helper';\nexport default { id: 'demo', apiVersion: 1, pages: [{ id: 'main', title: helper, component: () => <Panel title="x">ok</Panel> }] };\n`;

test('builds ESM against host shims and rejects forbidden imports, foreign kinds and unsafe entries', async () => {
    const dir = await plugin({ pages: ['main'], applications: { '/demo': 'main' } }, { 'ui/index.tsx': view, 'ui/helper.ts': "export const helper = 'Demo';" });
    try {
        const ctx = context(dir);
        const ok = await compile(ctx, null, { name: 'demo' });
        expect(ok.build?.error).toBeNull();
        expect(ok.build?.code).toContain('/plugins/ui/runtime/mauzcode-ui.js');
        expect(ok.build?.code).toContain('/plugins/ui/runtime/react-jsx-runtime.js');
        expect(ok.build?.hash).toMatch(/^[0-9a-f]{16}$/);
        expect(ok.build?.applications).toEqual({ '/demo': 'main' });
        expect((await compile(ctx, null, { name: 'demo' })).changed).toBe(false);

        await writeFile(join(dir, 'ui/index.tsx'), `import fs from 'node:fs';\nconsole.log(fs);\n${view}`);
        expect((await compile(ctx, null, { name: 'demo', force: true })).build?.error).toMatch(/may import only/);
        await writeFile(join(dir, 'ui/index.tsx'), `import x from '../src/secret';\nconsole.log(x);\n${view}`);
        expect((await compile(ctx, null, { name: 'demo', force: true })).build?.error).toMatch(/may import only/);

        await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'demo', procs: { ui: { canvasKinds: ['other.kind'] } } }));
        expect((await compile(ctx, null, { name: 'demo' })).build?.error).toMatch(/namespace of this plugin/);
        await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'demo', procs: { ui: { entry: '../escape.tsx' } } }));
        expect((await compile(ctx, null, { name: 'demo' })).build?.error).toMatch(/safe plugin-relative/);
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test('manifest serves only approved hashes; official plugins are pre-approved', async () => {
    const dir = await plugin({ pages: ['main'] }, { 'ui/index.tsx': view, 'ui/helper.ts': "export const helper = 'Demo';" });
    try {
        const pending = await manifest(context(dir), null, {});
        expect(pending.plugins).toEqual([]);
        expect(pending.pending[0]).toMatchObject({ name: 'demo', reason: 'unapproved' });
        const hash = pending.pending[0]!.hash!;
        const grants = { pages: ['main'], panels: [], actions: [], canvasKinds: [] };
        expect((await manifest(context(dir, 'user', [{ name: 'demo', hash, grants }]), null, {})).plugins[0]?.url).toBe(`/plugins/ui/demo/${hash}.js`);
        expect((await manifest(context(dir, 'user', [{ name: 'demo', hash: '0'.repeat(16), grants }]), null, {})).pending[0]?.reason).toBe('changed');
        expect((await manifest(context(dir, 'user', [{ name: 'demo', hash, grants: { ...grants, panels: ['more'] } }]), null, {})).pending[0]?.reason).toBe('changed');
        expect((await manifest(context(dir, 'official'), null, {})).plugins.map(p => p.name)).toEqual(['demo']);

        const ctx = context(dir);
        const user = { user: { id: 'u' } } as unknown as Session;
        expect((await bundle(ctx, user, { req: new Request('http://h/'), params: { name: 'demo', file: `${hash}.js` } })).status).toBe(404);
        expect((await bundle(ctx, null, { req: new Request('http://h/'), params: { name: 'demo', file: `${hash}.js` } })).status).toBe(401);
        const served = await bundle(context(dir, 'official'), user, { req: new Request('http://h/'), params: { name: 'demo', file: `${hash}.js` } });
        expect(served.status).toBe(200);
        expect(served.headers.get('cache-control')).toContain('immutable');
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test('sidebar placement is explicit, page-bound and included in approval equality', async () => {
    const dir = await plugin({ pages: ['main'], sidebarNavigation: ['main'] }, { 'ui/index.tsx': view, 'ui/helper.ts': "export const helper = 'Demo';" });
    try {
        const built = await compile(context(dir), null, { name: 'demo' });
        expect(built.build?.error).toBeNull();
        const hash = built.build!.hash!;
        const grants = { pages: ['main'], panels: [], actions: [], canvasKinds: [] };
        expect((await manifest(context(dir, 'user', [{ name: 'demo', hash, grants }]), null, {})).pending[0]?.reason).toBe('changed');
        expect((await manifest(context(dir, 'user', [{ name: 'demo', hash, grants: { ...grants, sidebarNavigation: ['main'] } }]), null, {})).plugins).toHaveLength(1);
        await writeFile(join(dir, 'package.json'), JSON.stringify({ procs: { ui: { pages: ['main'], sidebarNavigation: ['missing'] } } }));
        expect((await compile(context(dir), null, { name: 'demo' })).build?.error).toMatch(/must reference a requested page/);
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test('approval route requires owner, same origin and CSRF', async () => {
    const calls: unknown[] = [];
    const make = (role: string | null) => ({ fns: {
        auth: { currentUser: async () => ({ user: role ? { id: 'u', role } : null, required: true }), verifyCsrf: async ({ token }: { token: string }) => token === 'token' },
        http: { publicOrigin: async () => 'http://h' },
        plugins: { uiApprove: async (o: unknown) => { calls.push(o); return { ok: true }; } },
    } }) as unknown as Context;
    const req = (token = 'token', origin = 'http://h') => new Request('http://h/plugins/ui/approve', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': token, origin }, body: JSON.stringify({ name: 'demo', hash: 'a'.repeat(16) }) });
    expect((await approve(make(null), null, { req: req() })).status).toBe(401);
    expect((await approve(make('member'), null, { req: req() })).status).toBe(403);
    expect((await approve(make('owner'), null, { req: req('bad') })).status).toBe(403);
    expect((await approve(make('owner'), null, { req: req('token', 'http://evil') })).status).toBe(403);
    expect(calls).toEqual([]);
    expect((await approve(make('owner'), null, { req: req() })).status).toBe(200);
    expect(calls).toEqual([{ name: 'demo', hash: 'a'.repeat(16), revoke: false, approvedBy: 'u' }]);
});

test('inputKinds grants are owner-only and changes invalidate approval', async () => {
 const dir = await plugin({ inputKinds: ['demo-review'] }, { 'ui/index.tsx': view, 'ui/helper.ts': "export const helper = 'Demo';" });
 try {
  const built = await compile(context(dir), null, {name:'demo'});
  expect(built.build?.grants.inputKinds).toEqual(['demo-review']);
  const grants = {pages:[],panels:[],actions:[],canvasKinds:[]};
  expect((await manifest(context(dir,'user',[{name:'demo',hash:built.build!.hash,grants}]),null,{})).pending[0]?.reason).toBe('changed');
  for(const kind of ['secret','redmine-approval']) {
   await writeFile(join(dir,'package.json'), JSON.stringify({procs:{ui:{inputKinds:[kind]}}}));
   expect((await compile(context(dir),null,{name:'demo'})).build?.error).toContain('must belong');
  }
 } finally { await rm(dir,{recursive:true,force:true}); }
});

test('modelProviders grants compile, are validated and changes invalidate approval', async () => {
 const dir = await plugin({ modelProviders: ['acme'] }, { 'ui/index.tsx': view, 'ui/helper.ts': "export const helper = 'Demo';" });
 try {
  const built = await compile(context(dir), null, {name:'demo'});
  expect(built.build?.error).toBeNull();
  expect(built.build?.grants.modelProviders).toEqual(['acme']);
  const old = {pages:[],panels:[],actions:[],canvasKinds:[]};
  expect((await manifest(context(dir,'user',[{name:'demo',hash:built.build!.hash,grants:old}]),null,{})).pending[0]?.reason).toBe('changed');
  expect((await manifest(context(dir,'user',[{name:'demo',hash:built.build!.hash,grants:built.build!.grants}]),null,{})).plugins).toHaveLength(1);
  for (const id of ['custom', 'Acme', 'a_b']) {
   await writeFile(join(dir,'package.json'), JSON.stringify({procs:{ui:{modelProviders:[id]}}}));
   expect((await compile(context(dir),null,{name:'demo'})).build?.error).toContain('Invalid model provider id');
  }
 } finally { await rm(dir,{recursive:true,force:true}); }
});

test('chatCards grants compile only for kinds owned by the plugin and changes invalidate approval', async () => {
 const dir = await plugin({ chatCards: ['demo.review'] }, { 'ui/index.tsx': view, 'ui/helper.ts': "export const helper = 'Demo';" });
 try {
  const built = await compile(context(dir), null, {name:'demo'});
  expect(built.build?.error).toBeNull();
  expect(built.build?.grants.chatCards).toEqual(['demo.review']);
  const old = {pages:[],panels:[],actions:[],canvasKinds:[]};
  expect((await manifest(context(dir,'user',[{name:'demo',hash:built.build!.hash,grants:old}]),null,{})).pending[0]?.reason).toBe('changed');
  for (const kind of ['git.review', 'demo', 'Demo.review', 'demo._x']) {
   await writeFile(join(dir,'package.json'), JSON.stringify({procs:{ui:{chatCards:[kind]}}}));
   expect((await compile(context(dir),null,{name:'demo'})).build?.error).toContain('must belong to plugin demo');
  }
 } finally { await rm(dir,{recursive:true,force:true}); }
});
