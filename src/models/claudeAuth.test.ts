import {test,expect} from 'bun:test';
import auth from './claudeAuth';
import login from './claudeLogin';
import constants from '../llm/anthropicOAuthConstants';
import parse from '../llm/parseAnthropicAuthorizationInput';

function setup(handler:(init:RequestInit)=>Promise<Response>=async()=>Response.json({access_token:'new-access',refresh_token:'new-refresh',expires_in:3600})){
 let row:{value_enc:string;version:number}|null=null;
 let calls=0;
 const ctx:any={env:{ANTHROPIC_OAUTH_REDIRECT_URI:'https://example.test/callback'},state:{models:{}},fns:{}};
 const conn:any={id:'test',fetch:async(_url:string,init:RequestInit)=>{calls++;return handler(init);}};
 ctx.fns={secrets:{decryptLocal:async(o:any)=>o.envelope,encryptLocal:async(o:any)=>o.value,putLocal:async(o:any)=>{row={value_enc:o.value,version:(row?.version??0)+1};},deleteLocal:async()=>{row=null;}},procs:{db:{select:async(o:any)=>{if(o.sql.startsWith('SELECT'))return row?[{...row}]:[];if(!row||row.version!==o.params[4])return [];row={value_enc:o.params[0],version:row.version+1};return [{version:row.version}];},run:async()=>{}},events:{refresh:async()=>{}}},llm:{anthropicOAuthConstants:()=>constants(ctx,null,{}),parseAnthropicAuthorizationInput:(o:any)=>parse(ctx,null,o)},models:{claudeAuth:(o:any)=>auth(ctx,null,o),claudeRequest:(o:any)=>o.conn.fetch(o.url,o.init)}};
 return {ctx,conn,run:(op:any,tokens?:any)=>auth(ctx,null,{conn,op,tokens}),flow:(op:any,extra:any={})=>login(ctx,null,{conn,op,...extra}),calls:()=>calls,row:()=>row};
}
const tokens=(expires_in=3600)=>({access_token:'old-access',refresh_token:'old-refresh',expires_in});
test('Claude auth stores buffered expiry, redacts status, rejects missing refresh, clears without network',async()=>{
 const s=setup();await expect(s.run('store',{access_token:'bad',expires_in:3600})).rejects.toThrow();expect(s.row()).toBeNull();
 const start=Date.now();await s.run('store',tokens());const status=await s.run('status');expect(status.expiresAt).toBeGreaterThanOrEqual(start+3300000);expect(JSON.stringify(status)).not.toContain('old-access');expect((await s.run('token')).accessToken).toBe('old-access');await s.run('clear');expect((await s.run('status')).needsLogin).toBe(true);expect(s.calls()).toBe(0);
});
test('Claude refresh is single-flight and persists rotated tokens',async()=>{
 const s=setup(async()=>{await Bun.sleep(10);return Response.json(tokens(3600));});await s.run('store',tokens(1));const out=await Promise.all([s.run('token'),s.run('token')]);expect(s.calls()).toBe(1);expect(out[0].accessToken).toBe(out[1].accessToken);expect(JSON.parse(s.row()!.value_enc).refreshUncertain).toBe(false);
});
test('Unknown refresh outcome survives process restart and never retries',async()=>{
 const s=setup(async()=>{throw new Error('secret response');});await s.run('store',tokens(1));await expect(s.run('token')).rejects.toMatchObject({code:'OAUTH_OUTCOME_UNKNOWN'});s.ctx.state.models={};await expect(s.run('token')).rejects.toMatchObject({code:'OAUTH_OUTCOME_UNKNOWN'});expect(s.calls()).toBe(1);expect((await s.run('status')).needsLogin).toBe(true);
});
test('Rejected refresh requires login and stale refresh cannot overwrite logout',async()=>{
 const s=setup(async()=>new Response('',{status:401}));await s.run('store',tokens(1));await expect(s.run('token')).rejects.toMatchObject({code:'LOGIN_REQUIRED'});
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);const r=setup(async()=>{await gate;return Response.json(tokens());});await r.run('store',tokens(1));const pending=r.run('token');while(!r.calls())await Bun.sleep(1);await r.run('clear');release();await expect(pending).rejects.toMatchObject({code:'OAUTH_OUTCOME_UNKNOWN'});expect(r.row()).toBeNull();
});
test('PKCE flow validates state, exchanges via transport once, exposes no credentials',async()=>{
 let body:any;const s=setup(async(init)=>{body=JSON.parse(String(init.body));return Response.json(tokens());});const f=(await s.flow('start'))!;const u=new URL(f.authorizationUrl!);expect(u.searchParams.get('code_challenge_method')).toBe('S256');expect(u.searchParams.get('code')).toBe('true');expect((await s.flow('status'))!.status).toBe('pending');expect((await s.flow('submit',{flowId:f.flowId,code:'secret-code#wrong'}))!.status).toBe('pending');expect(s.calls()).toBe(0);
 const result=await s.flow('submit',{flowId:f.flowId,code:'secret-code#'+u.searchParams.get('state')});expect(result!.status).toBe('succeeded');expect(body.code_verifier).toBeTruthy();expect(body.code).toBe('secret-code');expect(JSON.stringify(result)).not.toContain('secret-code');expect(JSON.stringify(result)).not.toContain(body.code_verifier);await s.flow('submit',{flowId:f.flowId,code:'secret-code'});expect(s.calls()).toBe(1);
});
test('PKCE replacement, cancel, expiry and failed exchange are terminal',async()=>{
 const s=setup(async()=>{throw new Error('secret');});const first=(await s.flow('start'))!;const second=(await s.flow('start'))!;expect(first.flowId).not.toBe(second.flowId);await expect(s.flow('submit',{flowId:first.flowId,code:'x'})).rejects.toThrow();await s.flow('cancel');expect((await s.flow('status'))!.message).toBe('Login cancelled');const third=(await s.flow('start'))!;s.ctx.state.models.claudeFlows.test.expiresAt=0;expect((await s.flow('submit',{flowId:third.flowId,code:'x'}))!.status).toBe('expired');const fourth=(await s.flow('start'))!;expect((await s.flow('submit',{flowId:fourth.flowId,code:'x'}))!.status).toBe('failed');await s.flow('submit',{flowId:fourth.flowId,code:'x'});expect(s.calls()).toBe(1);
});

test('Loopback callback completes login and busy port falls back to paste',async()=>{
 const blocker=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response('busy')});
 const busy=setup();busy.ctx.env.ANTHROPIC_OAUTH_REDIRECT_URI=`http://localhost:${blocker.port}/callback`;
 try{const f=(await busy.flow('start'))!;expect(f.callbackListening).toBe(false);await busy.flow('cancel');}finally{blocker.stop(true);}
 const free=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response('probe')});const port=free.port;free.stop(true);
 const s=setup();s.ctx.env.ANTHROPIC_OAUTH_REDIRECT_URI=`http://localhost:${port}/callback`;
 try{const f=(await s.flow('start'))!;expect(f.callbackListening).toBe(true);const state=new URL(f.authorizationUrl!).searchParams.get('state');const bad=await fetch(`http://127.0.0.1:${port}/callback?code=x&state=wrong`);expect(bad.status).toBe(400);expect(s.calls()).toBe(0);const good=await fetch(`http://127.0.0.1:${port}/callback?code=x&state=${state}`);expect(good.status).toBe(200);expect((await s.flow('status'))!.status).toBe('succeeded');}finally{await s.flow('cancel');}
});
test('Cancel waits for delayed store rollback; replacement cannot be overwritten',async()=>{
 const s=setup();let release!:()=>void;let entered!:()=>void;const enteredPromise=new Promise<void>(r=>entered=r);const gate=new Promise<void>(r=>release=r);const put=s.ctx.fns.secrets.putLocal;s.ctx.fns.secrets.putLocal=async(o:any)=>{entered();await gate;await put(o);};
 const f=(await s.flow('start'))!;const submitting=s.flow('submit',{flowId:f.flowId,code:'x'});await enteredPromise;const cancelled=s.flow('cancel');release();await Promise.all([submitting,cancelled]);expect(s.row()).toBeNull();
 const starts=await Promise.all([s.flow('start'),s.flow('start')]);expect(starts[0]!.flowId).not.toBe(starts[1]!.flowId);await expect(s.flow('submit',{flowId:starts[0]!.flowId,code:'x'})).rejects.toThrow();await s.flow('cancel');
});
test('Resolved SOCKS login persists encrypted tokens and durable uncertain refresh',async()=>{
 const {mkTestCtx}=await import('../_testCtx.entry');
 const {default:provider}=await import('./$modelProvider_claude');
 const ctx=await mkTestCtx({env:{MAUZCODE_OAUTH_ENCRYPTION_KEY:Buffer.alloc(32,9).toString('base64'),ANTHROPIC_OAUTH_REDIRECT_URI:'https://example.test/callback'}});
 ctx.state.models??={};ctx.state.models.providers={claude:{owner:'core',module:'models',rel:'models/$modelProvider_claude.ts',definition:provider}};
 const transport:types.models.TransportSpec={kind:'socks',proxyId:'test-proxy'};
 ctx.state.registry.models.validateTransport=async(_c:unknown,_s:unknown,o:{transport:types.models.TransportSpec})=>o.transport;
 let seen:types.models.TransportSpec|undefined;let refresh=false;
 ctx.state.registry.models.fetch=async(_c:unknown,_s:unknown,o:{transport:types.models.TransportSpec})=>{seen=o.transport;if(refresh)throw new Error('lost response');return Response.json(tokens(1));};
 const created=await ctx.fns.models.create({provider:'claude',accountName:'oauth-test',config:{},secrets:{},transport});
 const {conn}=await ctx.fns.models.resolve({id:created.id});
 const flow=(await ctx.fns.models.claudeLogin({conn,op:'start'}))!;await ctx.fns.models.claudeLogin({conn,op:'submit',flowId:flow.flowId,code:'test-code'});
 expect(seen).toEqual(transport);const rows=await ctx.fns.procs.db.select({sql:'SELECT value_enc FROM local_secrets WHERE namespace=? AND name=?',params:['models',conn.id+'.claude-auth']});expect(rows).toHaveLength(1);expect(String(rows[0].value_enc)).not.toContain('old-access');
 refresh=true;await expect(ctx.fns.models.claudeAuth({conn,op:'token'})).rejects.toMatchObject({code:'OAUTH_OUTCOME_UNKNOWN'});expect((await ctx.fns.models.claudeAuth({conn,op:'status'})).needsLogin).toBe(true);
 await ctx.fns.models.claudeAuth({conn,op:'clear'});
},30000);
