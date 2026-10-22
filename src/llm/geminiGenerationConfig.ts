/**
 * Build native Gemini generation settings from explicit options and cached thinking-level metadata
 *
 * Use for Gemini requests only. Auto and unsupported reasoning preferences emit no thinking field; exact cached thinkingLevel values are the only permitted reasoning configuration. Supports JSON object and JSON schema response formats.
 * @param opts.model Provider-qualified model route used to identify cached metadata.
 * @param opts.modelId Exact native model identifier matched in the cached catalogue.
 * @param opts.max_tokens Positive integer output-token ceiling. @minimum 1
 * @param opts.temperature Finite sampling temperature accepted by the selected model.
 * @param opts.response_format OpenAI-style text, json_object or json_schema response format.
 * @param opts.reasoningEffort Exact advertised thinking level; auto omits reasoning settings. @default auto
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider-qualified model route used to identify cached metadata. */
        model: string;
        /** Exact native model identifier matched in the cached catalogue. */
        modelId: string;
        /** Positive integer output-token ceiling. @minimum 1 */
        max_tokens?: number;
        /** Finite sampling temperature accepted by the selected model. */
        temperature?: number;
        /** OpenAI-style text, json_object or json_schema response format. */
        response_format?: { type: string; json_schema?: { schema: Record<string, any>; name?: string; strict?: boolean } };
        /** Exact advertised thinking level; auto omits reasoning settings. @default auto */
        reasoningEffort?: types.llm.ReasoningEffort;
    },
): Promise<Record<string, any>> {
    const config:Record<string,any>={};
    if(opts.max_tokens !== undefined) {
     if(!Number.isSafeInteger(opts.max_tokens) || opts.max_tokens < 1) throw new Error('Gemini invalid max_tokens');
     config.maxOutputTokens=opts.max_tokens;
    }
    if(opts.temperature !== undefined) {
     if(!Number.isFinite(opts.temperature)) throw new Error('Gemini invalid temperature');
     config.temperature=opts.temperature;
    }
    if(opts.response_format && opts.response_format.type !== 'text') {
     if(!['json_object','json_schema'].includes(opts.response_format.type)) throw new Error('Gemini unsupported response format');
     config.responseMimeType='application/json';
     if(opts.response_format.type === 'json_schema') {
      const schema=opts.response_format.json_schema?.schema;
      if(!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error('Gemini missing JSON schema');
      config.responseJsonSchema=schema;
     }
    }
    if(opts.reasoningEffort && opts.reasoningEffort !== 'auto') {
     const catalog=await ctx.fns.llm.opencodeCatalog({cachedOnly:true});
     const model=catalog.models.find(m=>m.id===opts.modelId);
     const option=model?.reasoningOptions.find(o=>o.type === 'thinkingLevel' || o.type === 'thinking_level');
     if(option?.values?.includes(opts.reasoningEffort)) config.thinkingConfig={thinkingLevel:opts.reasoningEffort};
    }
    return config;
}
