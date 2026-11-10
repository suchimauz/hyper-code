import { expect, test } from 'bun:test';
import middleware from '../$middleware';
import document from './reactDocument';
import asset from './reactAsset';
import { resolve } from 'node:path';

const ctx: any = { fns: { auth: { currentUser: async () => ({ user: null, required: true }) }, h2: { redirect: () => null }, frontendRuntime: { page: async () => undefined } }, state: {} };
test('only fixed read-only auth assets bypass sign-in, not Vite or arbitrary auth files', async () => {
  for (const path of ['/auth/ui.js', '/auth/ui.css']) {
    expect(await middleware(ctx, null, {req:new Request('https://mauzcode.example'+path)})).toBeUndefined();
    expect((await middleware(ctx, null, {req:new Request('https://mauzcode.example'+path,{method:'POST'})}))?.status).toBe(401);
  }
  for (const path of ['/auth/ui.js.map','/auth/other.js','/ui-lab/src/main.tsx','/ui-lab/@fs/etc/passwd']) {
    expect((await middleware(ctx, null, {req:new Request('https://mauzcode.example'+path)}))?.status).toBe(401);
  }
});
test('auth document mounts no application shell or inline script', async () => {
  const r=await document({} as any,null,{}); const html=await r.text();
  expect(html).toContain('/auth/ui.js'); expect(html).toContain('/auth/ui.css');
  expect(html).not.toContain('htmx'); expect(html).not.toContain('/ui-lab');
  expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
});
test('fixed browser build exposes only the isolated auth entry and CSS', async () => {
  const buildCtx:any={state:{},fns:{procs:{project:{projectRoot:()=>resolve(import.meta.dir,'../..')}}}};
  for(const kind of ['js','css'] as const) {
    const r=await asset(buildCtx,null,{kind}); expect(r.status).toBe(200);
    const text=await r.text(); expect(text.length).toBeGreaterThan(100);
    expect(text).not.toContain('/api/v1/agents');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    const cached = buildCtx.state.authReactAssets.promise;
    await Promise.all([asset(buildCtx,null,{kind:'js'}),asset(buildCtx,null,{kind:'css'})]);
    expect(buildCtx.state.authReactAssets.promise).toBe(cached);
  }
});
