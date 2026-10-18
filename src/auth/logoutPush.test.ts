import { expect, test } from 'bun:test';
import logout from './$route_logout_POST';

function fixture(fail = false) {
 const calls:string[]=[];
 const ctx:any={fns:{
  procs:{auth:{cookieName:()=> 'session',verify:async()=>({sub:'owner',jti:'s_login'}),cookie:()=> 'session=; Max-Age=0'},db:{run:async()=>{calls.push('revoke-login');}},log:{warn:()=>{calls.push('warning');}}},
  webPush:{revokeSession:async({token}:any)=>{expect(token).toBe('test-token');calls.push('revoke-push');if(fail)throw Error('sensitive detail');}},
 }};
 const req=new Request('https://hyper.example/auth/logout',{method:'POST',headers:{cookie:'session=test-token',accept:'application/json'}});
 return {ctx,calls,req};
}
test('logout revokes push before its stable OIDC binding and clears cookie',async()=>{
 const f=fixture();const response=await logout(f.ctx,null,{req:f.req,params:{}});
 expect(f.calls).toEqual(['revoke-push','revoke-login']);expect(response.status).toBe(200);expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
});
test('push cleanup failure cannot block logout',async()=>{
 const f=fixture(true);const response=await logout(f.ctx,null,{req:f.req,params:{}});
 expect(f.calls).toEqual(['revoke-push','warning','revoke-login']);expect(await response.json()).toEqual({ok:true});
});
test('invalid cookie does not attempt push cleanup',async()=>{
 const f=fixture();f.ctx.fns.procs.auth.verify=async()=>null;
 const response=await logout(f.ctx,null,{req:f.req,params:{}});
 expect(f.calls).toEqual([]);expect(response.status).toBe(200);
});
