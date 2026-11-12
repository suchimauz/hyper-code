import { test, expect } from 'bun:test';
import call from './call';
import parseModelRouteFn from "./parseModelRoute";

for (const api of ['openai', 'anthropic', 'responses']) {
    test(`OpenCode ${api} exposes bounded JSON error diagnostics without request/key echoes`, async () => {
        let calls = 0;
        const ctx: any = { fns: { llm: { parseModelRoute: (o: any) => parseModelRouteFn({} as any, null, o),
            resolveEndpoint: async () => ({api, provider:'opencode',modelId:'test',url:'https://example.invalid',apiKey:'private-key'}),
            opencodeReasoningBody: async () => ({}),
            opencodeFetch: async () => { calls++; return Response.json({error:{code:'context_length_exceeded',type:'invalid_request_error',message:'prompt is too long private-key PRIVATE_PROMPT Bearer secret-token',request:'DO_NOT_EXPOSE'}},{status:400}); },
        } } };
        let message = '';
        try { await call(ctx,null,{model:'opencode:test',user:'PRIVATE_PROMPT',noFallback:true}); }
        catch (e) { message=String((e as Error).message); }
        expect(message).toContain('opencode 400');
        expect(message).toContain('context_length_exceeded');
        expect(message).toContain('prompt is too long');
        for (const hidden of ['private-key','PRIVATE_PROMPT','secret-token','DO_NOT_EXPOSE']) expect(message).not.toContain(hidden);
        expect(calls).toBe(1);
    });
}

for (const [label, body] of [['html','<html>private-body</html>'],['oversized',JSON.stringify({error:{message:'private-body'.repeat(1000)}})]]) {
    test(`OpenCode omits ${label} error body`, async () => {
        const ctx:any={fns:{llm:{ parseModelRoute: (o: any) => parseModelRouteFn({} as any, null, o),
            resolveEndpoint:async()=>({api:'openai',provider:'opencode',modelId:'test',url:'https://example.invalid'}),
            opencodeReasoningBody:async()=>({}),
            opencodeFetch:async()=>new Response(body,{status:400}),
        }}};
        let message='';
        try { await call(ctx,null,{model:'opencode:test',user:'hello',noFallback:true}); }
        catch(e){message=String((e as Error).message);}
        expect(message).toContain('opencode 400');
        expect(message).not.toContain('private-body');
        expect(message.length).toBeLessThan(1800);
    });
}
