import {test, expect} from 'bun:test';
import send from './opencodeFetch';

function fixture(failures: number, message = 'no response from provider in 120s') {
    const calls: any[] = [];
    const ctx: any = {fns:{
        settings:{getString:async()=>''},
        secrets:{resolveSetting:async()=>'fake-key'},
        llm:{connectFetch:async(o: any)=>{
            calls.push(o);
            if(calls.length <= failures) throw new Error(message);
            return Response.json({ok:true});
        }},
    }};
    return {ctx,calls};
}
const request = {url:'https://opencode.ai/inference/openai/v1/chat/completions',sessionId:'stable',init:{method:'POST',body:'{}'}};

test('OpenCode retries three header timeouts then succeeds with unchanged request',async()=>{
    const {ctx,calls}=fixture(3);
    expect((await send(ctx,null,request)).ok).toBe(true);
    expect(calls.length).toBe(4);
    for(const call of calls){
        expect(call.ms).toBe(120000);
        expect(call.init.body).toBe('{}');
        expect(call.init.headers.get('x-opencode-session')).toBe('stable');
    }
});
test('OpenCode stops after three retries',async()=>{
    const {ctx,calls}=fixture(99);
    await expect(send(ctx,null,request)).rejects.toThrow('no response from provider in 120s');
    expect(calls.length).toBe(4);
});
test('OpenCode does not retry other errors or cancelled requests',async()=>{
    const {ctx,calls}=fixture(99,'Unauthorized');
    await expect(send(ctx,null,request)).rejects.toThrow('Unauthorized');
    expect(calls.length).toBe(1);
    const controller=new AbortController();
    controller.abort();
    await expect(send(ctx,null,{...request,init:{...request.init,signal:controller.signal}})).rejects.toThrow();
    expect(calls.length).toBe(1);
});
test('OpenCode cancellation during a timeout prevents retry',async()=>{
    const {ctx,calls}=fixture(99);
    const controller=new AbortController();
    ctx.fns.llm.connectFetch=async(o:any)=>{
        calls.push(o);
        controller.abort();
        throw new Error('no response from provider in 120s');
    };
    await expect(send(ctx,null,{...request,init:{...request.init,signal:controller.signal}})).rejects.toThrow();
    expect(calls.length).toBe(1);
});
