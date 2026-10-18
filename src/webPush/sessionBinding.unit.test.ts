import {expect,test} from 'bun:test';
import binding from './sessionBinding';
import revoke from './revokeSession';

function fixture(claims:any, rows:any[]=[]){
 const calls:any[]=[];
 const ctx:any={fns:{procs:{auth:{verify:async()=>claims},db:{select:async()=>rows,run:async(o:any)=>{calls.push(o);}}},webPush:{}}};
 ctx.fns.webPush.sessionBinding=(opts:any)=>binding(ctx,null,opts);
 return {ctx,calls};
}
test('OIDC push identity survives cookie rotation and uses durable session expiry',async()=>{
 const f=fixture({sub:'user',jti:'s_same',exp:1},[{expires_at:9999999999999}]);
 const a=await binding(f.ctx,null,{token:'cookie-before'}),b=await binding(f.ctx,null,{token:'cookie-after'});
 expect(a).toEqual(b);expect(a?.expiresAt).toBe(9999999999999);expect(a?.sessionId).toBe('s_same');expect(a?.key).not.toContain('s_same');
});
test('revoked or foreign OIDC session has no push identity',async()=>{
 const f=fixture({sub:'user',jti:'s_revoked',exp:99});
 expect(await binding(f.ctx,null,{token:'cookie'})).toBeNull();
});
test('scoped bearer cannot establish browser push identity',async()=>{
 const f=fixture({sub:'user',kind:'external',exp:9999999999});
 expect(await binding(f.ctx,null,{token:'scoped-token'})).toBeNull();
});
test('logout deletes only owner and login matching the verified binding',async()=>{
 const f=fixture({sub:'user',exp:9999999999});await revoke(f.ctx,null,{token:'cookie-a'});
 expect(f.calls).toHaveLength(1);expect(f.calls[0].sql).toContain('owner_id = ? AND session_key = ?');
 expect(f.calls[0].params[0]).toBe('user');expect(f.calls[0].params[1]).not.toBe('cookie-a');
 const other=await binding(f.ctx,null,{token:'cookie-b'});expect(f.calls[0].params[1]).not.toBe(other?.key);
});
