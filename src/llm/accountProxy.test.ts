import {test,expect} from 'bun:test';
import {mkTestCtx} from '../_testCtx.entry';
const setup=()=>mkTestCtx({env:{MAUZCODE_OAUTH_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')}});
const tokens={access:'access',refresh:'refresh',expiresAt:Date.now()+3600000};
test('proxy bindings restrict deletion, preserve secrets and reconnect routing',async()=>{
 const c=await setup();const p=await c.fns.socksProxy.create({host:'127.0.0.1',port:1080,auth:true,username:'user',password:'private'});
 await c.fns.llm.saveAnthropicOAuth({...tokens,account:'one',proxyId:p.id});
 await c.fns.llm.saveAnthropicOAuth({...tokens,account:'two',proxyId:p.id});
 expect((await c.fns.llm.accountProxy({provider:'anthropic-oauth',account:'one'}))?.id).toBe(p.id);
 await expect(c.fns.socksProxy.remove({id:p.id,revision:1})).rejects.toMatchObject({code:'PROXY_IN_USE',status:409});
 expect((await c.fns.socksProxy.readSaved({id:p.id})).password).toBe('private');
 await c.fns.llm.saveAnthropicOAuth({...tokens,account:'one'});
 await expect(c.fns.llm.saveAnthropicOAuth({...tokens,account:'one',proxyId:null})).rejects.toThrow('cannot be changed');
 expect((await c.fns.socksProxy.list({}))[0].users).toHaveLength(2);
 await c.fns.llm.logoutAnthropicOAuth({account:'one'});
 await expect(c.fns.socksProxy.remove({id:p.id,revision:1})).rejects.toMatchObject({code:'PROXY_IN_USE'});
 await c.fns.llm.logoutAnthropicOAuth({account:'two'});
 await c.fns.socksProxy.remove({id:p.id,revision:1});
 expect(await c.fns.socksProxy.list({})).toEqual([]);
});
test('unknown proxy rolls back account save and SQL FK prevents bypass deletion',async()=>{
 const c=await setup();await expect(c.fns.llm.saveAnthropicOAuth({...tokens,account:'bad',proxyId:crypto.randomUUID()})).rejects.toThrow();
 expect(await c.fns.procs.db.select({sql:'SELECT account FROM oauth_credentials WHERE account=?',params:['bad']})).toEqual([]);
 const p=await c.fns.socksProxy.create({host:'127.0.0.1',port:1080,auth:false});await c.fns.llm.saveAnthropicOAuth({...tokens,account:'ok',proxyId:p.id});
 await expect(c.fns.procs.db.run({sql:'DELETE FROM socks_proxies WHERE id=?',params:[p.id]})).rejects.toThrow();
});

test('proxy deletion racing account creation never leaves dangling credentials',async()=>{
 const c=await setup();const p=await c.fns.socksProxy.create({host:'127.0.0.1',port:1080,auth:false});
 const results=await Promise.allSettled([c.fns.llm.saveAnthropicOAuth({...tokens,account:'race',proxyId:p.id}),c.fns.socksProxy.remove({id:p.id,revision:1})]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 const accounts=await c.fns.procs.db.select({sql:'SELECT account FROM oauth_credentials WHERE account=?',params:['race']});
 const proxies=await c.fns.socksProxy.list({});
 if(accounts.length){expect(proxies).toHaveLength(1);expect(proxies[0].users).toEqual([{provider:'anthropic-oauth',account:'race'}]);}
 else expect(proxies).toHaveLength(0);
});
