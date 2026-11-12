import {test,expect} from 'bun:test';
import {createServer, type Socket} from 'node:net';
// Test-only raw loading does not create runtime cross-import edges.
const transport=(await import('./probeTransport.ts')).default;
const check=(await import('./check.ts')).default;
async function fixture(options:{auth?:boolean;method?:number;password?:number;connect?:number;response?:string;stall?:boolean;fragment?:boolean;signal?:AbortSignal;overflow?:boolean}={}) {
 const sockets=new Set<Socket>();let connections=0;const requests:Buffer[]=[];
 const server=createServer(socket=>{connections++;sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});let step=0;let pending=Buffer.alloc(0);
 const send=async(b:Buffer)=>{if(options.fragment){for(const byte of b){socket.write(Buffer.from([byte]));await Bun.sleep(1);}}else socket.write(b);};
 socket.on('data',async b=>{pending=Buffer.concat([pending,b]);if(options.stall)return;if(options.overflow){socket.write(Buffer.alloc(1025));return;}
 if(step===0){if(pending.length<3)return;expect([...pending.subarray(0,3)]).toEqual([5,1,options.auth?2:0]);pending=pending.subarray(3);step=options.auth?1:2;await send(Buffer.from([5,options.method??(options.auth?2:0)]));return;}
 if(step===1){requests.push(pending);pending=Buffer.alloc(0);step=2;await send(Buffer.from([1,options.password??0]));return;}
 if(step===2){if(pending.length<17)return;expect([...pending.subarray(0,5)]).toEqual([5,1,0,3,10]);expect(pending.subarray(5,15).toString()).toBe('ip-api.com');expect(pending.readUInt16BE(15)).toBe(80);pending=pending.subarray(17);step=3;await send(Buffer.from([5,options.connect??0,0,1,127,0,0,1,0,80]));return;}
 if(step===3){if(!pending.includes('\r\n\r\n'))return;requests.push(pending);expect(pending.toString()).toStartWith('GET /json HTTP/1.1\r\n');step=4;const body=JSON.stringify({status:'success',query:'203.0.113.1',country:'Test'});socket.end(options.response??`HTTP/1.1 200 OK\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);}
 });});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=(server.address() as {port:number}).port;
 try {const result=await transport({} as never,null,{proxy:{host:'127.0.0.1',port,...(options.auth?{username:'user',password:'pass'}:{})},signal:options.signal});await Bun.sleep(5);expect(sockets.size).toBe(0);return {result,connections,requests};}
 finally {for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
test('no-auth remote DNS CONNECT and fixed request',async()=>{const {result,connections}=await fixture();expect(result).toEqual({ok:true,query:'203.0.113.1',country:'Test'});expect(connections).toBe(1);});
test('fragmented SOCKS auth and reply',async()=>{const {result,requests}=await fixture({auth:true,fragment:true});expect(result.ok).toBe(true);expect([...requests[0]!]).toEqual([1,4,117,115,101,114,4,112,97,115,115]);});
for(const [title,opts,code] of [['method',{method:255},'auth_refused'],['password',{auth:true,password:1},'auth_refused'],['CONNECT',{connect:5},'connect_refused']] as const)test(title+' refusal',async()=>{expect((await fixture(opts)).result.code).toBe(code);});
for(const [title,response,code] of [
 ['redirect','HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1/\r\nContent-Length: 0\r\n\r\n','http_error'],
 ['rate limit','HTTP/1.1 429 Too Many Requests\r\nRetry-After: 7\r\nContent-Length: 0\r\n\r\n','rate_limit'],
 ['invalid JSON','HTTP/1.1 200 OK\r\nContent-Length: 1\r\n\r\nx','invalid_response'],
 ['failed API','HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n{"status":"fail","query":"1.1.1.1"}','invalid_response'],
 ['invalid IP','HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n{"status":"success","query":"not an IP"}','invalid_response'],
 ['body bound','HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n'+'x'.repeat(65537),'invalid_response'],
 ['header bound','HTTP/1.1 200 OK\r\nX-Huge: '+'x'.repeat(9000)+'\r\n\r\n','invalid_response'],
] as const)test(title+' has safe failure and no retry',async()=>{const r=await fixture({response});expect(r.result.code).toBe(code);expect(r.connections).toBe(1);if(code==='rate_limit')expect(r.result.retryAfter).toBe(7);});
test('abort closes stalled socket',async()=>{const c=new AbortController();const t=setTimeout(()=>c.abort(),30);try{expect((await fixture({stall:true,signal:c.signal})).result.code).toBe('cancelled');}finally{clearTimeout(t);}});
test('ten second deadline closes stalled socket',async()=>{expect((await fixture({stall:true})).result.code).toBe('timeout');},12000);
function context(){return {state:{},fns:{socksProxy:{readSaved:async({id}:{id:string})=>({id,host:'localhost',port:1080,revision:2}),probeTransport:async()=>({ok:true,query:'1.1.1.1'})}}};}
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('check only UUID and revision metadata',async()=>{const ctx=context();await expect(check(ctx as never,null,{id:'http://foo'})).rejects.toThrow('Invalid proxy ID');expect(await check(ctx as never,null,{id:uuid(1)})).toMatchObject({ok:true,revision:2});});
test('30 per rolling minute',async()=>{const ctx=context();for(let i=0;i<30;i++)expect((await check(ctx as never,null,{id:uuid(i)})).ok).toBe(true);const r=await check(ctx as never,null,{id:uuid(31)});expect(r.code).toBe('rate_limit');expect(r.retryAfter).toBeGreaterThan(0);});
test('one per record and three concurrent, release after completion',async()=>{const ctx=context();let release!:()=>void;const gate=new Promise<void>(r=>release=r);ctx.fns.socksProxy.probeTransport=async()=>{await gate;return {ok:true,query:'1.1.1.1'};};const jobs=[1,2,3].map(n=>check(ctx as never,null,{id:uuid(n)}));expect((await check(ctx as never,null,{id:uuid(1)})).code).toBe('rate_limit');expect((await check(ctx as never,null,{id:uuid(4)})).code).toBe('rate_limit');release();await Promise.all(jobs);expect((await check(ctx as never,null,{id:uuid(4)})).ok).toBe(true);});
test('SOCKS buffer is bounded',async()=>{expect((await fixture({overflow:true})).result.code).toBe('invalid_response');});
test('chunked HTTP response',async()=>{const body=JSON.stringify({status:'success',query:'2001:db8::1'});expect((await fixture({response:`HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n${body.length.toString(16)}\r\n${body}\r\n0\r\n\r\n`})).result.query).toBe('2001:db8::1');});
test('HTTP-date Retry-After',async()=>{const date=new Date(Date.now()+45000).toUTCString();const result=(await fixture({response:`HTTP/1.1 429 Too Many Requests\r\nRetry-After: ${date}\r\nContent-Length: 0\r\n\r\n`})).result;expect(result.retryAfter).toBeGreaterThan(40);expect(result.retryAfter).toBeLessThanOrEqual(45);});
test('abort during storage releases admission without dialing',async()=>{const ctx=context();let calls=0;ctx.fns.socksProxy.readSaved=()=>new Promise(()=>{});ctx.fns.socksProxy.probeTransport=async()=>{calls++;return {ok:true,query:'1.1.1.1'};};const c=new AbortController();const job=check(ctx as never,{req:new Request('http://localhost',{signal:c.signal})},{id:uuid(1)});c.abort();expect((await job).code).toBe('cancelled');expect(calls).toBe(0);expect((ctx.state as any).socksProxy.checks.active.size).toBe(0);});
test('storage deadline is included in ten seconds',async()=>{const ctx=context();ctx.fns.socksProxy.readSaved=()=>new Promise(()=>{});expect((await check(ctx as never,null,{id:uuid(1)})).code).toBe('timeout');},12000);
test('upstream Retry-After prevents repeated transport starts',async()=>{const ctx=context();let calls=0;(ctx.fns.socksProxy as any).probeTransport=async()=>{calls++;return {ok:false,code:'rate_limit',retryAfter:30};};expect((await check(ctx as never,null,{id:uuid(1)})).retryAfter).toBe(30);expect((await check(ctx as never,null,{id:uuid(2)})).code).toBe('rate_limit');expect(calls).toBe(1);});
