/**
 * Convert canonical transcript text, images and tool turns into native Gemini contents
 *
 * Use for native generateContent requests. Replay opaque signed model parts stored on canonical tool calls, and reject unsupported input blocks rather than silently losing them.
 * @param opts.messages Canonical user, assistant and tool rows, with optional tool_calls[].geminiParts containing preserved signed native parts.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Canonical user, assistant and tool rows, with optional tool_calls[].geminiParts containing preserved signed native parts. */
        messages: Array<Record<string, any>>;
    },
): Promise<Array<{role: string; parts: Array<Record<string, any>>}>> {
    const contents: Array<{role:string;parts:Array<Record<string,any>>}> = [];
    const calls = new Map<string, {name:string; nativeId?:string}>();
    function parts(content:any):Array<Record<string,any>> {
     if (content == null || content === '') return [];
     if (typeof content === 'string') return [{text:content}];
     if (!Array.isArray(content)) throw new Error('Gemini unsupported message content');
     return content.map(p => {
      if(p?.type === 'text' && typeof p.text === 'string') return {text:p.text};
      if(p?.type === 'image' && typeof p.data === 'string' && typeof p.mimeType === 'string' && p.mimeType.startsWith('image/')) return {inlineData:{mimeType:p.mimeType,data:p.data}};
      if(p?.type === 'image_url' && typeof p.image_url?.url === 'string') {
       const m = /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(p.image_url.url);
       if(m) return {inlineData:{mimeType:m[1],data:m[2]}};
      }
      throw new Error('Gemini unsupported content block: '+String(p?.type));
     });
    }
    function push(role:string, ps:Array<Record<string,any>>) {
     if(!ps.length) return;
     if(contents.at(-1)?.role === role) contents.at(-1)!.parts.push(...ps);
     else contents.push({role,parts:ps});
    }
    for(const m of opts.messages) {
     if(m.role === 'system') throw new Error('Gemini system messages must use systemInstruction');
     if(m.role === 'tool') {
      const call = calls.get(m.tool_call_id);
      if(!call) throw new Error('Gemini unmatched tool response: '+String(m.tool_call_id));
      const ps = parts(m.content); const text = ps.filter(p => typeof p.text === 'string').map(p=>p.text).join('\n');
      push('user',[{functionResponse:{name:call.name,...(call.nativeId ? {id:call.nativeId}:{}),response:{output:text}}},...ps.filter(p=>p.inlineData)]);
      continue;
     }
     if(!['user','assistant'].includes(m.role)) throw new Error('Gemini unsupported role: '+String(m.role));
     const cs = m.tool_calls ?? [];
     const saved = cs.find((c:any)=>c.geminiParts !== undefined)?.geminiParts;
     if(saved !== undefined) {
      if(m.role !== 'assistant' || !Array.isArray(saved) || !saved.length) throw new Error('Gemini invalid preserved parts');
      const nativeCalls = saved.filter((p:any)=>p.functionCall);
      if(nativeCalls.length !== cs.length || nativeCalls.some((p:any,i:number)=>p.functionCall.name !== cs[i].name || JSON.stringify(p.functionCall.args ?? {}) !== JSON.stringify(cs[i].args ?? {}))) throw new Error('Gemini preserved calls do not match transcript');
      cs.forEach((c:any,i:number)=>calls.set(c.id,{name:c.name,nativeId:nativeCalls[i].functionCall.id}));
      push('model',structuredClone(saved)); continue;
     }
     const ps=parts(m.content);
     for(const c of cs) {
      if(m.role !== 'assistant' || typeof c.id !== 'string' || typeof c.name !== 'string') throw new Error('Gemini invalid canonical tool call');
      const p:any={functionCall:{name:c.name,args:c.args ?? {}}};
      if(c.thoughtSignature !== undefined) {
       if(typeof c.thoughtSignature !== 'string') throw new Error('Gemini invalid thought signature');
       p.thoughtSignature=c.thoughtSignature;
      }
      if(c.thought_signature !== undefined || c.reasoning_content !== undefined) throw new Error('Gemini cannot replay foreign reasoning signature protocol');
      calls.set(c.id,{name:c.name}); ps.push(p);
     }
     push(m.role === 'assistant' ? 'model':'user',ps);
    }
    return contents;
}
