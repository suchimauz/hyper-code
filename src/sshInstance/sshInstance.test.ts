import {describe,expect,test} from 'bun:test';
import validate from './validate';
import authorize from './authorize';
import trust from './trust';
import connection from './connection';
import getPage from './$route_GET';
import postPage from './$route_POST';
import pagesWidget from '../nav/$widget_pages';
import sshApp from './$app_ssh-instances.json';
test('SSH Instances appears only within Administration navigation',async()=>{
    const item={...sshApp,id:'app:ssh-instances',title:sshApp.label};
    const fake={fns:{nav:{items:async()=>[item]},settings:{get:async()=>undefined}}} as unknown as Context;
    const output=await pagesWidget.render(fake);
    expect(output.items?.some(i=>i.href==='/sshInstance')).toBe(false);
    expect(output.sections?.find(s=>s.title==='Administration')?.items?.some(i=>i.href==='/sshInstance')).toBe(true);
});
const ctx={} as Context;
const owner={user:{role:'owner'}} as unknown as Session;
describe('SSH instance security without network access',()=>{
    test('validates DNS IPv4 IPv6 and defaults',async()=>{
        for(const host of ['server.example.org','127.0.0.1','::1']) expect((await validate(ctx,null,{name:'gpu-1',host,user:'runner'})).port).toBe(22);
    });
    test('rejects option injection and malformed endpoint fields',async()=>{
        const base={name:'gpu',host:'example.org',user:'runner',port:22};
        for(const patch of [{name:'../gpu'},{host:'-oProxyCommand=bad'},{host:'a b'},{host:'user@host'},{user:'-root'},{port:0},{port:22.5},{port:65536}]) await expect(validate(ctx,null,{...base,...patch})).rejects.toThrow();
    });
    test('owner guard rejects member and anonymous RPC sessions',async()=>{
        await expect(authorize(ctx,{} as Session,{})).rejects.toThrow('Only owners');
        await expect(authorize(ctx,{user:{role:'member'}} as unknown as Session,{})).rejects.toThrow('Only owners');
        await authorize(ctx,owner,{}); await authorize(ctx,null,{});
        await authorize(ctx,{kind:'agent'},{}); await authorize(ctx,{kind:'repl'},{});
        for(const session of [{kind:'http'}, {kind:'ws'}, {kind:'unknown'}, {kind:'agent',req:new Request('http://localhost/rpc')}, {kind:'repl',user:{role:'member'}}]) {
            await expect(authorize(ctx,session,{})).rejects.toThrow('Only owners');
        }
    });
    test('trust false fails before reading registry or touching files',async()=>{
        const fake={fns:{sshInstance:{authorize:async()=>{}}}} as unknown as Context;
        await expect(trust(fake,null,{name:'gpu',hostKey:'ssh-ed25519 invalid',confirmed:false})).rejects.toThrow('Explicit');
    });
    test('unpinned connection refuses before filesystem or spawn',async()=>{
        const fake={fns:{sshInstance:{authorize:async()=>{},get:async()=>({name:'gpu',host:'example.org',user:'runner',port:22,pinnedHostKey:null}),validate:async()=>{}}}} as unknown as Context;
        await expect(connection(fake,null,{name:'gpu'})).rejects.toThrow('Confirm');
    });
    test('page and actions reject non-owners',async()=>{
        const req=new Request('http://localhost/sshInstance');
        expect((await getPage(ctx,null,{req,params:{}}) as Response).status).toBe(403);
        expect((await postPage(ctx,null,{req,params:{}})).status).toBe(403);
    });
    test('owner action rejects missing or cross-site origin before execution',async()=>{
        for(const origin of [undefined,'https://attacker.invalid']){
            const req=new Request('http://localhost/sshInstance',{method:'POST',headers:origin?{origin}:{}});
            expect((await postPage(ctx,owner,{req,params:{}})).status).toBe(403);
        }
    });
});
