/**
 * Normalize provider request usage without inventing missing counts
 *
 * Use on raw per-request usage with attribution captured before dispatch. Accept raw OpenAI chat/Responses, Anthropic raw, or common stream counts. Missing components remain null and partial; legacy streams with erased provenance remain unsupported. No DB or provider calls.
 * @param opts.binding Immutable request and source attribution captured before dispatch; explicit nullable goal identity.
 * @param opts.format Wire or common-stream format; use unsupported only for legacy erased provenance.
 * @param opts.usage One raw provider usage object, never context usage or cumulative session totals.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Immutable request and source attribution captured before dispatch; explicit nullable goal identity. */
        binding: types.goal.UsageBinding;
        /** Wire or common-stream format; use unsupported only for legacy erased provenance. */
        format: "openai-chat" | "openai-responses" | "anthropic-raw" | "mauzcode-stream-anthropic" | "common-stream" | "unsupported";
        /** One raw provider usage object, never context usage or cumulative session totals. */
        usage: unknown;
    },
): Promise<types.goal.UsageNormalized> {
    const b = opts.binding;
    for (const key of ['provider','requestId','sourceAgentId','runId','rootAccountingAgentId'] as const) {
     if (typeof b[key] !== 'string' || !b[key].trim()) throw new Error('Missing usage binding: ' + key);
    }
    if (b.goalIdAtBoundary !== null && (typeof b.goalIdAtBoundary !== 'string' || !b.goalIdAtBoundary.trim())) throw new Error('Explicit goal binding required');
    const identity = {provider:b.provider,requestId:b.requestId,sourceAgentId:b.sourceAgentId,runId:b.runId,rootAccountingAgentId:b.rootAccountingAgentId,goalIdAtBoundary:b.goalIdAtBoundary,format:opts.format};
    const fail = (quality: 'unknown' | 'unsupported', reason: string): types.goal.UsageNormalized => Object.freeze({...identity,quality,reason,inputTokens:null,cachedInputTokens:null,outputTokens:null});
    if (opts.format === 'unsupported' || opts.format === 'mauzcode-stream-anthropic') return fail('unsupported','Provider stream erased field-presence provenance or has no verified adapter');
    const obj = (v: unknown): Record<string,unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string,unknown> : {};
    const u = obj(opts.usage);
    const max = 9223372036854775807n;
    const count = (v: unknown): bigint | null => {
     if (typeof v === 'number') return Number.isSafeInteger(v) && v >= 0 ? BigInt(v) : null;
     if (typeof v !== 'string' || !/^(0|[1-9][0-9]*)$/.test(v) || v.length > 19) return null;
     const n = BigInt(v); return n <= max ? n : null;
    };
    let input: bigint | null = null, cached: bigint | null = null, output: bigint | null = null;
    if (opts.format === 'openai-chat') {
     input=count(u.prompt_tokens); cached=count(obj(u.prompt_tokens_details).cached_tokens); output=count(u.completion_tokens);
    } else if (opts.format === 'common-stream') {
     input=count(u.prompt_tokens ?? u.input_tokens); cached=count(obj(u.prompt_tokens_details).cached_tokens ?? u.cache_read_tokens ?? obj(u.input_tokens_details).cached_tokens); output=count(u.completion_tokens ?? u.output_tokens);
    } else if (opts.format === 'openai-responses') {
     input=count(u.input_tokens); cached=count(obj(u.input_tokens_details).cached_tokens); output=count(u.output_tokens);
    } else if (opts.format === 'anthropic-raw') {
     const uncached=count(u.input_tokens), write=count(u.cache_creation_input_tokens);
     cached=count(u.cache_read_input_tokens); output=count(u.output_tokens);
     if (uncached !== null && write !== null && cached !== null) input=uncached+write+cached;
    } else return fail('unsupported','Unrecognized usage format');
    if (input !== null && (input > max || cached !== null && cached > input) || output !== null && output > max) return fail('unknown','Usage violates inclusive-input or signed i64 bounds');
    if (input === null || cached === null || output === null) return Object.freeze({...identity,quality: input !== null || output !== null ? 'partial' : 'unknown',reason:'Missing or invalid nonnegative integer usage component',inputTokens:input === null ? null : String(input),cachedInputTokens:cached === null ? null : String(cached),outputTokens:output === null ? null : String(output)});
    if (input > max || cached > input || output > max) return fail('unknown','Usage violates inclusive-input or signed i64 bounds');
    return Object.freeze({...identity,quality:'exact',reason:null,inputTokens:String(input),cachedInputTokens:String(cached),outputTokens:String(output)});
}
