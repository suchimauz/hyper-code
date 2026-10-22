/**
 * Send native Gemini inference and normalize strict JSON or SSE responses without losing thought signatures
 *
 * Shared native Gemini transport for callGemini and streamGemini. Accepts converted contents and generation settings, validates native model output, preserves all signed parts on the first canonical tool call for tool-turn replay, and rejects malformed or truncated streams.
 * @param opts.model Provider-qualified OpenCode Gemini model route.
 * @param opts.contents Native Gemini conversation contents, already converted from the canonical transcript.
 * @param opts.system Optional top-level native system instruction.
 * @param opts.generationConfig Validated native generation settings.
 * @param opts.tools Native function declarations without an OpenAI wrapper.
 * @param opts.stream Request native SSE at streamGenerateContent; otherwise use generateContent. @default false
 * @param opts.signal Caller cancellation signal propagated through fetch and stream reads.
 * @param opts.sessionId Stable OpenCode session identifier, especially for Go prefix caching.
 * @param opts.onEvent Receives normalized text_delta and thinking_delta events.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider-qualified OpenCode Gemini model route. */
        model: string;
        /** Native Gemini conversation contents, already converted from the canonical transcript. */
        contents: Array<{role: string; parts: Array<Record<string, any>>}>;
        /** Optional top-level native system instruction. */
        system?: string;
        /** Validated native generation settings. */
        generationConfig?: Record<string, any>;
        /** Native function declarations without an OpenAI wrapper. */
        tools?: Array<{ name: string; description?: string; parameters?: Record<string, any> }>;
        /** Request native SSE at streamGenerateContent; otherwise use generateContent. @default false */
        stream?: boolean;
        /** Caller cancellation signal propagated through fetch and stream reads. */
        signal?: AbortSignal;
        /** Stable OpenCode session identifier, especially for Go prefix caching. */
        sessionId?: string;
        /** Receives normalized text_delta and thinking_delta events. */
        onEvent?: (event: {type: string; delta: string}) => void;
    },
): Promise<{ text: string; thinking: string; toolCalls: Array<{ id: string; name: string; args: Record<string, any>; thoughtSignature?: string; geminiParts?: Array<Record<string, any>> }>; finishReason: string | null; usage: Record<string, any> | null; requestedModel: string; responseModel: string | null }> {
    const ep=await ctx.fns.llm.resolveEndpoint({model:opts.model});
    const url=new URL(ep.url);
    if(ep.provider !== 'opencode' || url.origin !== 'https://opencode.ai' || !/^\/inference\/(?:go\/)?google\/v1beta\/models\/[^/:]+:generateContent$/.test(url.pathname) || url.search || url.hash) throw new Error('Gemini requires a native OpenCode generateContent endpoint');
    if(opts.stream) {url.pathname=url.pathname.replace(/:generateContent$/,':streamGenerateContent');url.search='?alt=sse';}
    const body:Record<string,any>={contents:opts.contents};
    if(opts.system) body.systemInstruction={parts:[{text:opts.system}]};
    if(opts.generationConfig && Object.keys(opts.generationConfig).length) body.generationConfig=opts.generationConfig;
    if(opts.tools?.length) body.tools=[{functionDeclarations:opts.tools}];
    const fetchOpts={url:url.href,init:{method:'POST',headers:{'content-type':'application/json',...(opts.sessionId ? {'x-opencode-session':opts.sessionId}:{})},body:JSON.stringify(body),signal:opts.signal},...(opts.sessionId ? {sessionId:opts.sessionId}:{})};
    const res=await ctx.fns.llm.opencodeFetch(fetchOpts);
    if(!res.ok) throw new Error('opencode Gemini '+res.status);
    if(!res.body) throw new Error('Gemini empty response body');
    let text='',thinking='',finishReason:string|null=null,responseModel:string|null=null;
    let usage:Record<string,any>|null=null; const nativeParts:Array<Record<string,any>>=[];
    const toolCalls:Array<{id:string;name:string;args:Record<string,any>;thoughtSignature?:string;geminiParts?:Array<Record<string,any>>}>=[];
    let sawCandidate=false;
    function consume(value:any) {
     if(!value || typeof value !== 'object' || Array.isArray(value) || value.error) throw new Error('Gemini invalid or error response');
     if(value.promptFeedback?.blockReason) throw new Error('Gemini prompt blocked: '+String(value.promptFeedback.blockReason));
     if(typeof value.modelVersion === 'string') responseModel=value.modelVersion;
     if(value.usageMetadata) {
      const u=value.usageMetadata;
      usage={...u,prompt_tokens:u.promptTokenCount ?? 0,completion_tokens:u.candidatesTokenCount ?? 0,total_tokens:u.totalTokenCount ?? 0};
     }
     if(value.candidates === undefined) {
      if(!value.usageMetadata && !value.modelVersion) throw new Error('Gemini missing candidates');
      return;
     }
     if(!Array.isArray(value.candidates) || value.candidates.length !== 1) throw new Error('Gemini expected one candidate');
     const candidate=value.candidates[0];
     if(candidate.index !== undefined && candidate.index !== 0) throw new Error('Gemini unexpected candidate index');
     sawCandidate=true;
     if(candidate.finishReason !== undefined) {
      if(typeof candidate.finishReason !== 'string') throw new Error('Gemini invalid finish reason');
      finishReason=candidate.finishReason;
      if(!['STOP','MAX_TOKENS'].includes(candidate.finishReason)) throw new Error('Gemini completion failed: '+candidate.finishReason);
     }
     if(candidate.content?.role !== undefined && candidate.content.role !== 'model') throw new Error('Gemini unexpected candidate role');
     if(candidate.content?.parts === undefined) return;
     if(!Array.isArray(candidate.content.parts)) throw new Error('Gemini invalid content parts');
     for(const p of candidate.content.parts) {
      if(!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Gemini invalid part');
      if(p.thought_signature !== undefined) throw new Error('Gemini unknown thought signature protocol');
      if(p.thoughtSignature !== undefined && typeof p.thoughtSignature !== 'string') throw new Error('Gemini invalid thought signature');
      if(p.thought !== undefined && typeof p.thought !== 'boolean') throw new Error('Gemini invalid thought marker');
      if(Object.keys(p).some(key=>!['text','thought','thoughtSignature','functionCall'].includes(key)) || (p.text !== undefined && typeof p.text !== 'string') || (p.text !== undefined && p.functionCall !== undefined)) throw new Error('Gemini unsupported output part');
      nativeParts.push(structuredClone(p));
      if(typeof p.text === 'string') {
       if(p.thought) {thinking+=p.text;opts.onEvent?.({type:'thinking_delta',delta:p.text});}
       else {text+=p.text;opts.onEvent?.({type:'text_delta',delta:p.text});}
      } else if(p.functionCall) {
       const c=p.functionCall;
       if(typeof c.name !== 'string' || !c.name || (c.args !== undefined && (!c.args || typeof c.args !== 'object' || Array.isArray(c.args)))) throw new Error('Gemini invalid function call');
       if(c.id !== undefined && (typeof c.id !== 'string' || !c.id)) throw new Error('Gemini invalid function call id');
       const id=c.id ?? 'gemini_'+Bun.randomUUIDv7();
       if(toolCalls.some(tc=>tc.id === id)) throw new Error('Gemini duplicate or incremental function call is unsupported');
       toolCalls.push({id,name:c.name,args:c.args ?? {},...(p.thoughtSignature !== undefined ? {thoughtSignature:p.thoughtSignature}:{})});
      } else if(p.thoughtSignature === undefined) throw new Error('Gemini unsupported output part');
     }
    }
    if(!opts.stream || /\bapplication\/(?:[\w.-]+\+)?json\b/i.test(res.headers.get('content-type') ?? '')) {
     const parsed=await res.json();
     if(Array.isArray(parsed)) {for(const chunk of parsed) consume(chunk);} else consume(parsed);
    } else {
     for await(const frame of ctx.fns.llm.parseSSE({body:res.body})) {
      opts.signal?.throwIfAborted();
      if(frame.data === '[DONE]') break;
      let parsed:any;
      try {parsed=JSON.parse(frame.data);} catch {throw new Error('Gemini malformed SSE JSON');}
      consume(parsed);
     }
    }
    opts.signal?.throwIfAborted();
    if(!sawCandidate || !finishReason) throw new Error('Gemini incomplete response: missing candidate or finish reason');
    if(toolCalls.length) toolCalls[0]!.geminiParts=nativeParts;
    return {text,thinking,toolCalls,finishReason,usage,requestedModel:ep.modelId,responseModel};
}
