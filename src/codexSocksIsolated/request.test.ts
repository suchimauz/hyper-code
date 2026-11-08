import {test,expect} from 'bun:test';
import request from './request';
test('production source refuses unlisted endpoints and unsupported inputs before networking',async()=>{
 for(const extra of [{url:'https://target.invalid'},{url:'https://chatgpt.com/backend-api/codex/models',proxyPort:0},{url:'https://chatgpt.com/backend-api/codex/responses',method:'POST',body:new Uint8Array(8388609)},{url:'https://chatgpt.com/backend-api/codex/models',headers:{authorization:'x\r\ny'}}]){
 let calls=0;await expect(request({} as never,null,{proxyPort:1,...extra,onDone:()=>calls++} as never)).rejects.toThrow();expect(calls).toBe(1);
 }
});
test('production has no CA injection, hostname override, fallback or project imports',async()=>{
 const source=await Bun.file(import.meta.dir+'/request.ts').text();expect(source).not.toContain('ca:');expect(source).not.toContain('ca?:');expect(source).toContain("host:'127.0.0.1'");expect(source).toContain('rejectUnauthorized:true,checkServerIdentity:tls.checkServerIdentity');expect(source).not.toContain('fetch(');expect(source).not.toContain('ctx.fns');
});
