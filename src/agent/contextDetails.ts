/**
 * Aggregate durable context usage and measured request/tool timings for a session footer.
 * Uses only this agent's ledger, not ancestors or expiring telemetry. Historical missing
 * readings are excluded, never imputed: coverage counts let clients label partial totals.
 * TPS is measured output divided by decode time (request duration minus TTFT), not wall time.
 * @param opts.agentId Existing agent whose durable measurements should be aggregated.
 */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Existing agent identifier; ancestors are not included. */ agentId: string;
}): Promise<types.agent.ContextUsageDetails> {
    const rows = await ctx.fns.procs.db.select({ sql: "SELECT type, payload FROM events WHERE agent_id = ? AND type IN ('context_usage', 'tool_call') ORDER BY idx", params: [opts.agentId] }) as Array<{ type: string; payload: string }>;
    const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
    let requests = 0, input = 0, output = 0, tokenRequests = 0, cached = 0, cacheInput = 0, cacheWrite = 0, cacheRequests = 0;
    let llmMs = 0, timedRequests = 0, ttft = 0, ttftRequests = 0, decodeMs = 0, decodeTokens = 0;
    let toolMs = 0, tools = 0, timedTools = 0;
    // API-equivalent list price of the agent's current model (USD per 1M tokens); an estimate, not a bill.
    const modelRow = (await ctx.fns.procs.db.select({ sql: 'SELECT model FROM agents WHERE id = ?', params: [opts.agentId] }) as Array<{ model: string | null }>)[0];
    let price: { input: number; output: number; cacheRead: number | null; cacheWrite: number | null } | null = null;
    if (modelRow?.model) { try { price = (await ctx.fns.llm.modelTokenPrice({ models: [modelRow.model] }))[modelRow.model] ?? null; } catch { price = null; } }
    let cost = 0, costRequests = 0;
    for (const row of rows) {
        let data: Record<string, any> = {};
        try { data = JSON.parse(row.payload) ?? {}; } catch { /* A malformed ledger row remains uncovered. */ }
        if (row.type === 'tool_call') {
            tools++;
            if (valid(data.durationMs)) { toolMs += data.durationMs; timedTools++; }
            continue;
        }
        requests++;
        const u = data.usage, m = data.metrics;
        if (valid(u?.prompt_tokens) && valid(u?.completion_tokens)) {
            input += u.prompt_tokens; output += u.completion_tokens; tokenRequests++;
            if (price) {
                const read = valid(u.cache_read_tokens) && u.cache_read_tokens <= u.prompt_tokens ? u.cache_read_tokens : 0;
                const write = valid(u.cache_write_tokens) && u.cache_write_tokens <= u.prompt_tokens - read ? u.cache_write_tokens : 0;
                cost += ((u.prompt_tokens - read - write) * price.input + read * (price.cacheRead ?? price.input) + write * (price.cacheWrite ?? price.input) + u.completion_tokens * price.output) / 1e6;
                costRequests++;
            }
        }
        if (valid(u?.cache_read_tokens) && valid(u?.prompt_tokens) && u.cache_read_tokens <= u.prompt_tokens) {
            cached += u.cache_read_tokens; cacheInput += u.prompt_tokens; cacheWrite += valid(u.cache_write_tokens) && u.cache_write_tokens <= u.prompt_tokens - u.cache_read_tokens ? u.cache_write_tokens : 0; cacheRequests++;
        }
        if (valid(m?.llmTimeMs)) { llmMs += m.llmTimeMs; timedRequests++; }
        if (valid(m?.ttftMs) && valid(m?.llmTimeMs) && m.ttftMs <= m.llmTimeMs) {
            ttft += m.ttftMs; ttftRequests++;
            if (valid(u?.completion_tokens) && m.llmTimeMs > m.ttftMs) { decodeMs += m.llmTimeMs - m.ttftMs; decodeTokens += u.completion_tokens; }
        }
    }
    return {
        breakdown: null,
        session: { llmTimeMs: timedRequests || !requests ? llmMs : null, toolTimeMs: timedTools || !tools ? toolMs : null, avgTtftMs: ttftRequests ? ttft / ttftRequests : null, tokensPerSecond: decodeMs > 0 ? decodeTokens * 1000 / decodeMs : null },
        usage: { requests, inputTokens: tokenRequests || !requests ? input : null, outputTokens: tokenRequests || !requests ? output : null, cachedInputTokens: cacheRequests || !requests ? cached : null, uncachedInputTokens: cacheRequests || !requests ? cacheInput - cached - cacheWrite : null, cacheWriteTokens: cacheRequests || !requests ? cacheWrite : null, cacheHitRatio: cacheInput > 0 ? cached / cacheInput : null, costUsd: price && (costRequests || !requests) ? cost : null, price },
        coverage: { requests, tokenRequests, timedRequests, ttftRequests, cacheRequests, tools, timedTools },
    };
}
