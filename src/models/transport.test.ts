import {afterEach, describe, expect, mock, test} from 'bun:test';
import routed from './fetch';
import validate from './validateTransport';
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });
const direct = {kind:'direct'} as const;
const socks = {kind:'socks',proxyId:'proxy'} as const;
const ssh = {kind:'ssh-tunnel',instance:'host'} as const;
function fixture() {
 const release = mock(() => {}), request = mock(async (_opts: any) => new Response('ok'));
 const tunnelSignal = new AbortController();
 const fns = {socksProxy:{readSaved:mock(async () => ({host:'proxy',port:1080})),request,validateIdentity:mock(async () => {})}, sshProvider:{tunnel:mock(async () => ({port:1081,signal:tunnelSignal.signal,release}))}, sshInstance:{get:mock(async () => ({pinnedHostKey:'pin'}))},procs:{db:{select:mock(async () => [{id:'proxy'}])}}};
 const ctx = {fns} as unknown as Context;
 return {ctx,fns,release,request,tunnelSignal};
}
const call = (f: ReturnType<typeof fixture>, transport = ssh as types.models.TransportSpec, extra: Partial<Parameters<typeof routed>[2]> = {}) => routed(f.ctx,null,{transport,url:'https://example.invalid/test',...extra});
describe('model transports', () => {
 test('direct preserves options, status, headers and body',async () => {
  const send = mock(async (_url: any, _init: any) => new Response('direct',{status:201,headers:{'x-test':'yes'}})); globalThis.fetch = send as any;
  const r = await call(fixture(),direct,{init:{method:'POST',body:'body'}});
  expect(r.status).toBe(201); expect(r.headers.get('x-test')).toBe('yes'); expect(await r.text()).toBe('direct'); expect(send.mock.calls[0]![1].redirect).toBe('error');
 });
 test('SOCKS uses saved endpoint, normalized headers and POST bytes',async () => {
  const f=fixture(); expect(await (await call(f,socks,{init:{method:'POST',headers:[['X-Test','yes']],body:'data'}})).text()).toBe('ok');
  expect(f.fns.socksProxy.readSaved).toHaveBeenCalledWith({id:'proxy'}); expect(f.request.mock.calls[0]![0]).toMatchObject({proxy:{host:'proxy',port:1080},method:'POST',headers:{'x-test':'yes'}});
  expect(new TextDecoder().decode(f.request.mock.calls[0]![0].body)).toBe('data');
 });
 test('SSH lease survives headers and releases once on EOF plus onDone',async () => {
  const f=fixture(); const r=await call(f); expect(f.release).not.toHaveBeenCalled(); expect(await r.text()).toBe('ok'); f.request.mock.calls[0]![0].onDone(); expect(f.release).toHaveBeenCalledTimes(1);
 });
 test('body cancellation releases lease',async () => {
  const f=fixture(); f.request.mockImplementation(async () => new Response(new ReadableStream({}))); const r=await call(f); await r.body!.cancel(); expect(f.release).toHaveBeenCalledTimes(1);
 });
 for (const transport of [direct,socks,ssh]) {
  test(`${transport.kind} timeout before headers`,async () => {
   const f=fixture(); const hang=async () => await new Promise<Response>(() => {}); globalThis.fetch=hang as any; f.request.mockImplementation(hang);
   await expect(call(f,transport,{timeoutMs:10})).rejects.toMatchObject({code:'TRANSPORT'}); if(transport===ssh) expect(f.release).toHaveBeenCalledTimes(1);
  });
  test(`${transport.kind} abort through body`,async () => {
   const f=fixture(), ac=new AbortController(); const stream=async () => new Response(new ReadableStream({})); globalThis.fetch=stream as any; f.request.mockImplementation(stream);
   const r=await call(f,transport,{signal:ac.signal}); ac.abort(); await expect(r.text()).rejects.toBeDefined(); if(transport===ssh) expect(f.release).toHaveBeenCalledTimes(1);
  });
  test(`${transport.kind} deadline through body`,async () => {
   const f=fixture(); const stream=async () => new Response(new ReadableStream({})); globalThis.fetch=stream as any; f.request.mockImplementation(stream);
   const r=await call(f,transport,{timeoutMs:10}); await expect(r.text()).rejects.toBeDefined(); if(transport===ssh) expect(f.release).toHaveBeenCalledTimes(1);
  });
 }
 test('pre-aborted init signal makes no request',async () => {
  const f=fixture(), ac=new AbortController(); ac.abort(); await expect(call(f,ssh,{init:{signal:ac.signal}})).rejects.toMatchObject({code:'TRANSPORT'}); expect(f.fns.sshProvider.tunnel).not.toHaveBeenCalled();
 });
 test('late tunnel acquisition after timeout is released',async () => {
  const f=fixture(); f.fns.sshProvider.tunnel.mockImplementation(async () => {await Bun.sleep(30);return {port:1081,signal:f.tunnelSignal.signal,release:f.release};});
  await expect(call(f,ssh,{timeoutMs:5})).rejects.toBeDefined(); await Bun.sleep(40); expect(f.release).toHaveBeenCalledTimes(1); expect(f.request).not.toHaveBeenCalled();
 });
 test('tunnel exit aborts body and releases lease',async () => {
  const f=fixture(); f.request.mockImplementation(async () => new Response(new ReadableStream({}))); const r=await call(f); f.tunnelSignal.abort(); await expect(r.text()).rejects.toBeDefined(); expect(f.release).toHaveBeenCalledTimes(1);
 });
 test('proxy failure never falls back, SSH releases',async () => {
  const f=fixture(), send=mock(async () => new Response('bad')); globalThis.fetch=send as any; f.request.mockImplementation(async () => {throw Error('unreachable');});
  for(const t of [socks,ssh]) await expect(call(f,t)).rejects.toMatchObject({code:'TRANSPORT'}); expect(send).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledTimes(1);
 });
 test('missing proxy and failed tunnel never send',async () => {
  const f=fixture(); f.fns.socksProxy.readSaved.mockImplementation(async () => {throw Error('missing');}); f.fns.sshProvider.tunnel.mockImplementation(async () => {throw Error('failed');});
  for(const t of [socks,ssh]) await expect(call(f,t)).rejects.toMatchObject({code:'TRANSPORT'}); expect(f.request).not.toHaveBeenCalled();
 });
 test('no-body response releases immediately',async () => {const f=fixture(); f.request.mockImplementation(async () => new Response(null,{status:204})); expect((await call(f)).status).toBe(204); expect(f.release).toHaveBeenCalledTimes(1);});
 test('unsafe destinations and invalid timeouts rejected before IO',async () => {
  const f=fixture(); for(const url of ['/relative','file:///tmp/a','https://user:pass@example.com']) await expect(call(f,direct,{url})).rejects.toMatchObject({code:'TRANSPORT'});
  for(const t of [socks,ssh]) await expect(call(f,t,{url:'http://example.com'})).rejects.toMatchObject({code:'TRANSPORT'});
  for(const timeoutMs of [0,NaN,1.5,3600001]) await expect(call(f,ssh,{timeoutMs})).rejects.toMatchObject({code:'TRANSPORT'}); expect(f.request).not.toHaveBeenCalled(); expect(f.fns.sshProvider.tunnel).not.toHaveBeenCalled();
 });
 test('unsupported proxy method rejected',async () => {const f=fixture(); await expect(call(f,socks,{init:{method:'PUT'}})).rejects.toMatchObject({code:'TRANSPORT'});expect(f.request).not.toHaveBeenCalled();});
});
describe('model transport validation', () => {
 const check=(f:ReturnType<typeof fixture>,transport:types.models.TransportSpec,allowed:types.models.TransportSpec['kind'][]=['direct','socks','ssh-tunnel'])=>validate(f.ctx,null,{transport,allowed});
 test('accepts allowed saved transports without secrets or network',async () => {const f=fixture(); for(const t of [direct,socks,ssh]) await check(f,t);expect(f.fns.socksProxy.readSaved).not.toHaveBeenCalled();expect(f.request).not.toHaveBeenCalled();});
 test('rejects provider-disallowed and unknown kinds',async () => {const f=fixture(); await expect(check(f,ssh,['direct'])).rejects.toThrow();await expect(check(f,{kind:'unknown'} as any)).rejects.toThrow();});
 test('rejects empty proxy, malformed proxy and missing proxy',async () => {const f=fixture(); await expect(check(f,{kind:'socks',proxyId:''})).rejects.toThrow();f.fns.procs.db.select.mockImplementation(async () => []); await expect(check(f,socks)).rejects.toThrow();f.fns.socksProxy.validateIdentity.mockImplementation(async () => {throw Error('bad UUID');});await expect(check(f,socks)).rejects.toThrow();});
 test('rejects missing, unknown and unpinned SSH instance',async () => {const f=fixture();await expect(check(f,{kind:'ssh-tunnel',instance:''})).rejects.toThrow();f.fns.sshInstance.get.mockImplementation(async () => ({pinnedHostKey:''}));await expect(check(f,ssh)).rejects.toThrow();f.fns.sshInstance.get.mockImplementation(async () => {throw Error('missing');});await expect(check(f,ssh)).rejects.toThrow();});
});
