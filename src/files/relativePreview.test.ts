import { expect, test } from 'bun:test';
import absolute from './$middleware_absolute';
import embed from './$middleware_embed';
import remote from './$middleware_remote';
import raw from './rawResponse';

test('all path-based asset boundaries reject anonymous callers before filesystem access', async () => {
  const ctx = {fns:{auth:{currentUser:async()=>({required:true,user:null,legacy:false})}}} as any;
  for(const [fn,path] of [[absolute,'absolute/tmp/a.png'],[embed,'embed/tmp/a.png'],[remote,'remote/host/tmp/a.png']] as const) {
    const response=await fn(ctx,null,{req:new Request('http://localhost/files/'+path),params:{}});
    expect(response?.status).toBe(401);
  }
});
test('private result assets stop before local or SSH reads', async () => {
  const ctx={fns:{files:{isPrivateResult:async()=>true}}} as any;
  expect((await raw(ctx,null,{path:'/private/result.svg'})).status).toBe(404);
  expect((await raw(ctx,null,{path:'/private/result.svg',host:'remote'})).status).toBe(404);
});
test('asset middleware does not authenticate unrelated routes', async () => {
  for(const fn of [absolute,embed,remote]) expect(await fn({} as any,null,{req:new Request('http://localhost/unrelated'),params:{}})).toBeUndefined();
});
