/**
 * Run a nonstreaming native OpenCode Gemini text or structured-output request
 *
 * Use for a single Gemini completion outside an agent tool loop. Converts supported explicit response formats, uses cached exact thinking levels only, and returns normalized output and gateway model metadata.
 * @param opts.model Provider-qualified OpenCode Gemini model route.
 * @param opts.user User message text.
 * @param opts.system Optional system instruction.
 * @param opts.max_tokens Positive integer maximum output tokens. @minimum 1
 * @param opts.temperature Finite sampling temperature supported by the model.
 * @param opts.response_format Text, JSON object or JSON schema response format.
 * @param opts.signal Cancellation signal propagated to inference and response reads.
 * @param opts.reasoningEffort Exact advertised native thinking level; auto and unsupported levels are omitted. @default auto
 * @param opts.sessionId Stable session identifier sent to OpenCode for Go prefix caching.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider-qualified OpenCode Gemini model route. */
        model: string;
        /** User message text. */
        user: string;
        /** Optional system instruction. */
        system?: string;
        /** Positive integer maximum output tokens. @minimum 1 */
        max_tokens?: number;
        /** Finite sampling temperature supported by the model. */
        temperature?: number;
        /** Text, JSON object or JSON schema response format. */
        response_format?: { type: string; json_schema?: { schema: Record<string, any>; name?: string; strict?: boolean } };
        /** Cancellation signal propagated to inference and response reads. */
        signal?: AbortSignal;
        /** Exact advertised native thinking level; auto and unsupported levels are omitted. @default auto */
        reasoningEffort?: types.llm.ReasoningEffort;
        /** Stable session identifier sent to OpenCode for Go prefix caching. */
        sessionId?: string;
    },
): Promise<{ text: string; thinking: string; toolCalls: Array<{ id: string; name: string; args: Record<string, any>; thoughtSignature?: string; geminiParts?: Array<Record<string, any>> }>; finishReason: string | null; usage: Record<string, any> | null; requestedModel: string; responseModel: string | null }> {
    const ep=await ctx.fns.llm.resolveEndpoint({model:opts.model});
    const generationConfig=await ctx.fns.llm.geminiGenerationConfig({model:opts.model,modelId:ep.modelId,max_tokens:opts.max_tokens,temperature:opts.temperature,response_format:opts.response_format,reasoningEffort:opts.reasoningEffort});
    return ctx.fns.llm.geminiGenerate({model:opts.model,contents:[{role:'user',parts:[{text:opts.user}]}],system:opts.system,generationConfig,signal:opts.signal,sessionId:opts.sessionId});
}
