import { expect, test } from 'bun:test';
import route from './$route_$id_POST';

test('file show preserves explicit SSH/local host and leaves omitted host to workspace resolution', async () => {
  for (const host of ['home-dev', 'local', undefined]) {
    let shown: any;
    const ctx = { fns: { procs: { db: { select: async () => [{}] } }, canvas: {
      show: async (args: any) => { shown = args; }, update: async () => ({}), revision: async () => ({panel:'1'}),
    } } } as any;
    const response = await route(ctx, null, {params:{id:'target-agent'}, req:new Request('http://localhost/canvas/target-agent', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({show:{kind:'file',args:{path:'src/test.ts',...(host ? {host} : {})}}})})});
    expect(response.status).toBe(200);
    expect(shown).toEqual({agentId:'target-agent',kind:'file',args:{path:'src/test.ts',...(host ? {host} : {})}});
  }
});
