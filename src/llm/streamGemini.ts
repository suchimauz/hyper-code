/**
 * Stream an agent turn through native OpenCode Gemini with signed tool-call replay
 *
 * Use for Gemini agent turns. Builds canonical agent instructions and history, converts OpenAI-shaped registered tools to native functionDeclarations, forwards a stable session identity, and emits normalized text and thought deltas.
 * @param opts.agent Live agent supplying model route, history, tool narrowing and reasoning preference.
 * @param opts.signal Cancellation signal propagated to fetch and stream reads.
 * @param opts.onEvent Callback receiving normalized text_delta and thinking_delta events.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Live agent supplying model route, history, tool narrowing and reasoning preference. */
        agent: types.agent.Agent;
        /** Cancellation signal propagated to fetch and stream reads. */
        signal?: AbortSignal;
        /** Callback receiving normalized text_delta and thinking_delta events. */
        onEvent?: (event: {type: string; delta: string}) => void;
    },
): Promise<{ text: string; thinking: string; toolCalls: Array<{ id: string; name: string; args: Record<string, any>; thoughtSignature?: string; geminiParts?: Array<Record<string, any>> }>; finishReason: string | null; usage: Record<string, any> | null; requestedModel: string; responseModel: string | null }> {
    const {agent}=opts;
    const ep=await ctx.fns.llm.resolveEndpoint({model:agent.model});
    const request=await ctx.fns.agent.buildLlmRequest({agent});
    const contents=await ctx.fns.llm.toGeminiContents({messages:request.messages});
    const wire=ctx.fns.agent.wireTools({agent,api:'openai'});
    const tools=wire.map((tool:any)=>{
     const f=tool.function;
     if(!f || typeof f.name !== 'string') throw new Error('Gemini invalid tool declaration');
     return {name:f.name,description:f.description,parameters:f.parameters};
    });
    const generationConfig=await ctx.fns.llm.geminiGenerationConfig({model:agent.model,modelId:ep.modelId,reasoningEffort:agent.reasoningEffort});
    return ctx.fns.llm.geminiGenerate({model:agent.model,contents,system:request.system,generationConfig,tools,stream:true,signal:opts.signal,sessionId:agent.id,onEvent:opts.onEvent});
}
