import {test,expect} from 'bun:test';
import vapid from './vapid';
import * as wp from 'web-push';
function fixture(initial:object){let stored=JSON.stringify(initial);let writes=0;const ctx:any={fns:{procs:{db:{transaction:({fn}:any)=>fn(),select:async()=>[]}},secrets:{get:async()=>stored,set:async({value}:any)=>{stored=value;writes++;}}}};return {ctx,writes:()=>writes};}
test('repair legacy VAPID metadata without rotating subscribed keypair; generated request works',async()=>{
 const pair=wp.generateVAPIDKeys();const f=fixture(pair);
 const result=await vapid(f.ctx,null,{subject:'https://hyper.example'});
 expect(result.publicKey).toBe(pair.publicKey);expect(result.privateKey).toBe(pair.privateKey);expect(result.subject).toBe('https://hyper.example');expect(f.writes()).toBe(1);
 expect(await vapid(f.ctx,null,{})).toEqual(result);expect(f.writes()).toBe(1);
 const sub={endpoint:'https://web.push.apple.com/test',keys:{p256dh:wp.generateVAPIDKeys().publicKey,auth:Buffer.alloc(16,1).toString('base64url')}};
 const req=wp.generateRequestDetails(sub,'test',{vapidDetails:result});expect(req.method).toBe('POST');
});
test('legacy read fails clearly without trusted subject; invalid subject cannot overwrite keys',async()=>{
 const f=fixture(wp.generateVAPIDKeys());await expect(vapid(f.ctx,null,{})).rejects.toThrow('HTTPS initialization');await expect(vapid(f.ctx,null,{subject:'http://example.com'})).rejects.toThrow('public HTTPS');expect(f.writes()).toBe(0);
});
