/**
 * Preview the next request context and expose full-history fallback instead of stale usage
 *
 * Use for the context meter. Reads durable model, compact metadata and history, then assembles the same request as inference in preview mode, including bootstrap, repaired tool pairs, attachment contents and cached relevance choices. Estimates message, system and tool-schema tokens without an LLM or relevance-network call. Estimates are not provider tokenization: last successful provider usage is returned separately, never substituted for the current payload. Returns why a compact checkpoint cannot be used.
 * @param opts.agentId Existing agent whose next outgoing context should be measured without changing its transcript.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Existing agent whose next outgoing context should be measured without changing its transcript. */
        agentId: string;
    },
): Promise<{ estimatedTokens: number; contextWindow: number | null; mode: "full" | "compact"; fallback: "missing_generation" | "missing_checkpoint" | "incompatible_checkpoint" | "invalid_boundary" | null; revision: number | null; messageCount: number; lastReportedTokens: number | null; lastReportedAt: number | null }> {
    const agent = ctx.state.agent[opts.agentId] ?? await ctx.fns.session.load({ id: opts.agentId });
    if (!agent) throw new Error("Agent not found");
    const rows = await ctx.fns.procs.db.select({ sql: "SELECT model, sleep_context FROM agents WHERE id = ?", params: [opts.agentId] }) as Array<{ model: string; sleep_context: Record<string, unknown> | null }>;
    if (!rows[0]) throw new Error("Agent not found");
    const messages = await ctx.fns.session.getMessages({ id: opts.agentId });
    const snapshot = { ...agent, model: rows[0].model, sleepContext: rows[0].sleep_context, messages };
    const request = await ctx.fns.agent.buildLlmRequest({ agent: snapshot, preview: true });
    const endpoint = await ctx.fns.llm.resolveEndpoint({ model: snapshot.model });
    const tools = ctx.fns.agent.wireTools({ agent: snapshot, api: endpoint.api });
    const estimatedTokens = await ctx.fns.compaction.estimateTokens({ messages: [
        ...request.messages,
        ...(request.system ? [{ role: "system", content: request.system }] : []),
        ...(tools.length ? [{ role: "system", content: JSON.stringify(tools) }] : []),
    ] });
    const usageRows = await ctx.fns.procs.db.select({ sql: "SELECT payload, ts FROM events WHERE agent_id = ? AND type = 'context_usage' ORDER BY idx DESC LIMIT 1", params: [opts.agentId] }) as Array<{ payload: string; ts: number }>;
    let lastReportedTokens: number | null = null, lastReportedAt: number | null = null;
    try {
        const usage = JSON.parse(usageRows[0]?.payload ?? "{}").usage;
        const prompt = Number(usage?.prompt_tokens ?? usage?.input_tokens), completion = Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0);
        if (Number.isFinite(prompt) && prompt >= 0 && Number.isFinite(completion) && completion >= 0) {
            lastReportedTokens = prompt + completion; lastReportedAt = Number(usageRows[0]?.ts ?? 0);
        }
    } catch { /* Missing or malformed prior usage is not a current budget. */ }
    return { estimatedTokens, contextWindow: await ctx.fns.compaction.contextWindow({ model: snapshot.model }), ...request.context, messageCount: request.messages.length, lastReportedTokens, lastReportedAt };
}
