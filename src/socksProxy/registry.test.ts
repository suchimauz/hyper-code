import {test,expect} from 'bun:test';
import {mkTestCtx} from '../_testCtx.entry';
const setup=()=>mkTestCtx({env:{MAUZCODE_OAUTH_ENCRYPTION_KEY:Buffer.alloc(32,17).toString('base64')}});
const base={name:'same',host:'EXAMPLE.com',port:1080,auth:false};
test('registry stable UUID, duplicate labels, safe listing and optimistic revisions',async()=>{
 const c=await setup();const a=await c.fns.socksProxy.create(base);const b=await c.fns.socksProxy.create(base);expect(a.id).not.toBe(b.id);expect(a.host).toBe('example.com');
 const changed=await c.fns.socksProxy.update({...base,id:a.id,revision:1,name:'renamed'});expect(changed.id).toBe(a.id);expect(changed.revision).toBe(2);
 await expect(c.fns.socksProxy.update({...base,id:a.id,revision:1})).rejects.toMatchObject({status:409});
 await expect(c.fns.socksProxy.remove({id:a.id,revision:1})).rejects.toMatchObject({status:409});
 await c.fns.socksProxy.remove({id:a.id,revision:2});await c.fns.socksProxy.remove({id:a.id,revision:2});
 expect(await c.fns.socksProxy.list({})).toEqual([{...b,users:[]}]);
});
test('encrypted pair preserve replace disable and deletion; list never leaks',async()=>{
 const c=await setup();let a=await c.fns.socksProxy.create({...base,auth:true,username:'user',password:' secret '});
 const [raw]=await c.fns.procs.db.select({sql:'SELECT value_enc FROM local_secrets WHERE namespace=? AND name=?',params:['socksProxy',a.id]});expect(raw.value_enc).not.toContain(' secret ');
 expect(JSON.stringify(await c.fns.socksProxy.list({}))).not.toMatch(/username|password|credential_ref|secret:\/\//);
 a=await c.fns.socksProxy.update({...base,auth:true,id:a.id,revision:a.revision});expect((await c.fns.socksProxy.readSaved({id:a.id})).password).toBe(' secret ');
 await expect(c.fns.socksProxy.update({...base,auth:true,id:a.id,revision:a.revision,username:'new'})).rejects.toMatchObject({status:400});
 a=await c.fns.socksProxy.update({...base,auth:true,id:a.id,revision:a.revision,username:'new',password:'newpass'});expect((await c.fns.socksProxy.readSaved({id:a.id})).username).toBe('new');
 a=await c.fns.socksProxy.update({...base,id:a.id,revision:a.revision});expect((await c.fns.socksProxy.readSaved({id:a.id})).password).toBeUndefined();expect(await c.fns.secrets.getLocal({namespace:'socksProxy',name:a.id})).toBeNull();
 a=await c.fns.socksProxy.update({...base,auth:true,id:a.id,revision:a.revision,username:'x',password:'y'});await c.fns.socksProxy.remove({id:a.id,revision:a.revision});expect(await c.fns.secrets.getLocal({namespace:'socksProxy',name:a.id})).toBeNull();
});
test('record and secret operations roll back together on persistence and encryption failure',async()=>{
 const c=await setup();const run=c.state.registry.procs.db.run;
 c.state.registry.procs.db.run=async(ctx:any,s:any,o:any)=>{if(o.sql.startsWith('INSERT INTO socks_proxies'))throw new Error('injected persistence failure');return run(ctx,s,o);};
 await expect(c.fns.socksProxy.create({...base,auth:true,username:'u',password:'p'})).rejects.toThrow();
 expect(await c.fns.procs.db.select({sql:"SELECT name FROM local_secrets WHERE namespace='socksProxy'"})).toEqual([]);expect(await c.fns.socksProxy.list({})).toEqual([]);c.state.registry.procs.db.run=run;
 let a=await c.fns.socksProxy.create({...base,auth:true,username:'u',password:'old'});
 c.state.registry.procs.db.run=async(ctx:any,s:any,o:any)=>{if(o.sql.startsWith('UPDATE socks_proxies')||o.sql.startsWith('DELETE FROM socks_proxies'))throw new Error('injected persistence failure');return run(ctx,s,o);};
 await expect(c.fns.socksProxy.update({...base,id:a.id,revision:1,auth:true,username:'new',password:'replacement'})).rejects.toThrow();expect((await c.fns.socksProxy.readSaved({id:a.id})).password).toBe('old');
 await expect(c.fns.socksProxy.remove({id:a.id,revision:1})).rejects.toThrow();expect((await c.fns.socksProxy.readSaved({id:a.id})).password).toBe('old');
 c.state.registry.procs.db.run=run;c.env.MAUZCODE_OAUTH_ENCRYPTION_KEY='invalid';await expect(c.fns.socksProxy.create({...base,auth:true,username:'u',password:'p'})).rejects.toThrow();expect((await c.fns.socksProxy.list({})).length).toBe(1);
});
test('saved records and encrypted credentials survive a module reload',async()=>{
 const c=await setup();const a=await c.fns.socksProxy.create({...base,auth:true,username:'persisted',password:'persistent-secret'});await c.fns.procs.repl.load({name:'socksProxy'});expect(await c.fns.socksProxy.list({})).toEqual([{...a,users:[]}]);expect((await c.fns.socksProxy.readSaved({id:a.id})).password).toBe('persistent-secret');
});
test('strict local validation accepts IPs and rejects URLs, bad ports and incomplete pairs',async()=>{
 const c=await setup();expect((await c.fns.socksProxy.validate({...base,host:'[2001:0db8::1]'})).host).toBe('2001:db8::1');expect((await c.fns.socksProxy.validate({...base,host:'127.0.0.1'})).host).toBe('127.0.0.1');
 for(const host of ['https://example.com','u:p@host','host/path','a b','999.999.999.999','-host','a..b','fe80::1%eth0'])await expect(c.fns.socksProxy.validate({...base,host})).rejects.toThrow();
 for(const port of [0,65536,1.5,'1080'])await expect(c.fns.socksProxy.validate({...base,port})).rejects.toThrow();
 for(const patch of [{name:'n'.repeat(101)},{auth:true,username:'x'},{auth:true,username:'x',password:''},{auth:true,username:'x',password:'я'.repeat(128)}])await expect(c.fns.socksProxy.validate({...base,...patch})).rejects.toThrow();
 await expect(c.fns.socksProxy.create({...base,auth:true})).rejects.toThrow();
});
