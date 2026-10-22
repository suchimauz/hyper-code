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
