import { test, expect } from 'bun:test';
import fetchSSH from './fetch';
import inferenceScript from './inferenceScript';
const ssh = {instance:'mock',provider:'codex' as const,account:'mock'};
function context(code:string):any {
 return {fns:{sshInstance:{authorize:async()=>{},connection:async()=>({bin:'python3',args:['-c',code],host:'ignored'})},sshAccount:{registry:async()=>[{...ssh,status:'connected'}],inferenceScript:async()=>''}}};
}
const ready="import sys,json\nr=json.loads(sys.stdin.readline())\nprint(json.dumps({'ready':True}),flush=True)\nassert sys.stdin.readline().strip()=='dispatch'\n";
const opts={ssh,url:'https://chatgpt.com/backend-api/codex/responses',init:{method:'POST',body:'{}'}};
test('disconnect before dispatch is replay-safe',async()=>{
 try{await fetchSSH(context('import sys;sys.exit(255)'),null,opts);throw Error('expected failure');}catch(e:any){expect(e.transportFailure).toEqual({kind:'ssh_transport',phase:'before_dispatch',retryable:true});}
});
test('disconnect after dispatch is ambiguous, never safe to replay',async()=>{
 try{await fetchSSH(context(ready+'sys.exit(255)'),null,opts);throw Error('expected failure');}catch(e:any){expect(e.transportFailure?.phase).toBe('ambiguous');expect(e.transportFailure?.retryable).toBe(false);}
});
test('explicit pre-provider rejection is permanent',async()=>{
 try{await fetchSSH(context(ready+"print(json.dumps({'rejected':True}),flush=True)"),null,opts);throw Error('expected failure');}catch(e:any){expect(e.transportFailure?.phase).toBe('permanent');}
});
test('mid-body failure remains ambiguous',async()=>{
 const r=await fetchSSH(context(ready+"print(json.dumps({'status':200,'headers':{}}),flush=True)\nprint('partial',flush=True)\nsys.exit(1)"),null,opts);
 await expect(r.text()).rejects.toMatchObject({transportFailure:{phase:'ambiguous',retryable:false}});
});
test('body cancellation releases the SSH process',async()=>{
 const r=await fetchSSH(context(ready+"print(json.dumps({'status':200,'headers':{}}),flush=True)\nimport time;time.sleep(30)"),null,opts);
 await r.body!.cancel();expect(r.body!.locked).toBe(false);
});
test('abort before dispatch is not classified for retry',async()=>{
 const controller=new AbortController();controller.abort();
 await expect(fetchSSH(context(''),null,{...opts,init:{signal:controller.signal}})).rejects.toMatchObject({name:'AbortError'});
});
test('real Python bridge handshake waits for dispatch and rejects invalid endpoint offline',async()=>{
 const script=await inferenceScript({} as any,null,{});
 const proc=Bun.spawn(['python3','-c',script],{stdin:'pipe',stdout:'pipe',stderr:'pipe'});
 proc.stdin.write(JSON.stringify({ssh,url:'http://invalid'})+'\n');
 const reader=proc.stdout.getReader();const first=await reader.read();expect(new TextDecoder().decode(first.value)).toContain('"ready": true');
 proc.stdin.write('dispatch\n');proc.stdin.end();
 const next=await reader.read();expect(new TextDecoder().decode(next.value)).toContain('"rejected": true');
 expect(await proc.exited).toBe(1);await reader.cancel();reader.releaseLock();
});
test('large request body is flushed before dispatch handshake',async()=>{
 const body='x'.repeat(3*1024*1024);
 const r=await fetchSSH(context(ready+"assert len(r['body'])==3*1024*1024\nprint(json.dumps({'status':200,'headers':{}}),flush=True)\nprint('ok',flush=True)"),null,{...opts,init:{body}});
 expect(await r.text()).toBe('ok\n');
});
test('oversized newline-terminated handshake is permanent',async()=>{
 await expect(fetchSSH(context("print('x'*70000,flush=True)"),null,opts)).rejects.toMatchObject({transportFailure:{phase:'permanent',retryable:false}});
});

test('OpenCode forwards caller authorization on stdin without a remote account registry row',async()=>{
 const token='Bearer stdin-only-opencode-secret';
 const script=await inferenceScript({} as any,null,{});
 expect(script).not.toContain(token);
 const c=context(ready+"assert r['headers']['authorization']=='Bearer stdin-only-opencode-secret'\nassert r['headers']['anthropic-version']=='2023-06-01'\nassert r['ssh']['provider']=='opencode'\nprint(json.dumps({'status':200,'headers':{}}),flush=True)\nprint('ok',flush=True)");
 c.fns.sshAccount.registry=async()=>{throw Error('OpenCode must not read remote account credentials');};
 const response=await fetchSSH(c,null,{ssh:{...ssh,provider:'opencode'},url:'https://opencode.ai/inference/anthropic/v1/messages',init:{method:'POST',headers:{authorization:token,'anthropic-version':'2023-06-01'},body:'{}'}});
 expect(await response.text()).toBe('ok\n');
});

test('OpenCode bridge permits only exact inference POST and catalogue GET routes',async()=>{
 const script=await inferenceScript({} as any,null,{});
 const python=`import os,json,io,urllib.request,urllib.error
from unittest.mock import patch
SCRIPT=json.loads(os.environ['BRIDGE_SCRIPT'])
class Output:
 def __init__(self):self.buffer=io.BytesIO()
 def write(self,s):self.buffer.write(s.encode())
 def flush(self):pass
class Reply:
 status=200;headers={'content-type':'application/json'}
 def __init__(self):self.data=b'{"ok":true}'
 def read1(self,n):d=self.data;self.data=b'';return d
calls=[]
class Opener:
 def open(self,req,timeout):calls.append(req);return Reply()
def build(*handlers):
 assert len(handlers)==1 and handlers[0].redirect_request(None,None,None,None,None) is None
 return Opener()
def run(url,method='POST',body='{}',valid=False,auth='Bearer STDIN_SECRET'):
 calls.clear();out=Output()
 r={'ssh':{'provider':'opencode','account':'main'},'url':url,'method':method,'body':body,'headers':{'anthropic-version':'2023-06-01','cookie':'STRIP_ME','proxy-authorization':'STRIP_ME','host':'evil.example','User-Agent':'opencode/official','x-opencode-session':'stable-session'}}
 if auth is not None:r['headers']['authorization']=auth
 with patch('sys.stdin',io.StringIO(json.dumps(r)+'\\ndispatch\\n')),patch('sys.stdout',out),patch('urllib.request.build_opener',side_effect=build):
  try:exec(compile(SCRIPT,'bridge.py','exec'),{})
  except SystemExit as e:assert e.code==1
 output=out.buffer.getvalue()
 assert b'STDIN_SECRET' not in output
 if valid:
  assert len(calls)==1 and b'"status": 200' in output
  h={k.lower():v for k,v in calls[0].header_items()}
  assert h.get('authorization')==(auth if auth and auth.strip() else None) and h['anthropic-version']=='2023-06-01'
  assert h['user-agent']=='Hyper/OpenCode' and h['x-opencode-session']=='stable-session'
  assert calls[0].full_url==url
  assert not any(k in h for k in ('cookie','proxy-authorization','host'))
 else:assert not calls and b'"rejected": true' in output
base='https://opencode.ai'
paths=['/inference/openai/v1/chat/completions','/inference/openai/v1/responses','/inference/anthropic/v1/messages']
for path in paths:
 run(base+path,valid=True)
 run(base+path,'GET',None)
 run(base+path+'?key=bad')
 run(base+path+'?')
 run(base+path+'#')
 run(base+path+'#bad')
 run(base+path+'/extra')
 run(base+path.replace('/v1/','/v2/'))
run(base+'/inference/v1/models','GET',None,True)
run(base+'/inference/v1/models')
run(base+'/inference/v1/models','GET','{}')
run(base+'/inference/v1/models?q=x','GET',None)
management='/console/api/v1/budgets/members'
run(base+management,'GET',None,True)
run(base+management)
run(base+management,'GET','{}')
run(base+management,'DELETE',None)
for suffix in ['?','?q=x','#fragment','/extra','/']:
 run(base+management+suffix,'GET',None)
for path in ['/console/api/v1/budgets','/console/api/v1/budgets/memberships','/console/api/v1/members']:
 run(base+path,'GET',None)
for url in ['http://opencode.ai','https://opencode.ai:444','https://opencode.ai.evil','https://user:pass@opencode.ai','https://opencode.ai:443','https://evil.example','https://opencode.ai@evil.example']:
 run(url+paths[0])
for path in ['/','/inference/v1/arbitrary','/api/me','/inference/openai/v1/../v1/responses']:
 run(base+path)
gemini='/inference/google/v1beta/models/'
for model in ['gemini-2.5-pro','a_B-1.2','A']:
 for operation in [':generateContent',':streamGenerateContent?alt=sse']:
  endpoint=base+gemini+model+operation
  run(endpoint,valid=True)
  for method in ['GET','PUT','DELETE','post']:run(endpoint,method)
  run(endpoint,auth=None)
  run(endpoint,auth='')
for model in ['','..','a..b','../x','a/b','a%2Fb','a%2eb','модель','a b']:
 for operation in [':generateContent',':streamGenerateContent?alt=sse']:run(base+gemini+model+operation)
for suffix in [':generateContent?',':generateContent?alt=sse',':streamGenerateContent',':streamGenerateContent?',':streamGenerateContent?alt=json',':streamGenerateContent?alt=sse&key=x',':streamGenerateContent?alt=sse&alt=sse',':streamGenerateContent?alt=sse?',':streamGenerateContent?ALT=sse',':streamGenerateContent?alt=sse#',':generateContent#',':generateContent/extra']:
 run(base+gemini+'safe'+suffix)
for auth in [None,'','   ']:
 run(base+paths[0],valid=True,auth=auth)
 run(base+'/inference/v1/models','GET',None,True,auth=auth)
 for path in paths[1:]+[management]:run(base+path,'GET' if path==management else 'POST',None if path==management else '{}',auth=auth)
go=base+'/inference/go/'
for path in ['openai/v1/chat/completions','openai/v1/responses','anthropic/v1/messages','google/v1beta/models/safe:generateContent','google/v1beta/models/safe:streamGenerateContent?alt=sse']:
 run(go+path,valid=True)
 for auth in [None,'','   ']:run(go+path,auth=auth)
 for method in ['GET','PUT','DELETE']:run(go+path,method)
 run(go+path+'&key=x' if '?' in path else go+path+'?key=x')
for path in ['google/v1beta/models/a..b:generateContent','google/v1beta/models/a%2fb:generateContent','google/v1beta/models/a/b:generateContent','google/v1beta/models/a:streamGenerateContent','google/v1beta/models/a:generateContent?alt=sse','openai/v1/chat/completions/extra','v1/models/extra','../v1/models','go/v1/models','v1/models?','v1/models?q=x']:
 run(go+path,'GET',None)
for auth in [None,'','Bearer STDIN_SECRET']:
 run(go+'v1/models','GET',None,True,auth=auth)
run(go+'v1/models','POST')
run(go+'v1/models','GET','{}')
print('OpenCode bridge security checks passed')
`;
 const proc=Bun.spawn(['python3','-c',python],{env:{...process.env,BRIDGE_SCRIPT:JSON.stringify(script)},stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr,exit]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);
 expect(stderr).toBe('');expect(exit).toBe(0);expect(stdout).toContain('security checks passed');
});
