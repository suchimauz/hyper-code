/**
 * Measure an agent's current context size from the last provider-reported prompt plus newer messages
 *
 * Returns the token count the next model request will occupy: the latest provider-reported prompt_tokens plus a local estimate of only the own transcript messages persisted after that request (tool results, replies, new user turns). Falls back to a full local estimate when the last usage is missing, predates the active compaction checkpoint, came from another model, or lacks a coverage boundary. Use for compaction thresholds and context indicators so they share one number.
 * @param opts.agentId Agent whose next-request context is measured.
 * @param opts.model Provider-qualified model route the next request targets; defaults to the persisted agent model.
 * @param opts.fallbackTokens Caller's full uncalibrated local estimate used when no fresh provider usage exists (calibration is applied here); defaults to estimating the projected transcript. @minimum 0
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent whose next-request context is measured. */
        agentId: string;
        /** Provider-qualified model route the next request targets; defaults to the persisted agent model. */
        model?: string;
        /** Caller's full uncalibrated local estimate used when no fresh provider usage exists (calibration is applied here); defaults to estimating the projected transcript. @minimum 0 */
        fallbackTokens?: number;
    },
): Promise<{ tokens: number; source: "provider" | "estimate"; reportedTokens: number | null; deltaTokens: number | null; reportedAt: number | null }> {
    const rows = await ctx.fns.procs.db.select({ sql: "SELECT model, sleep_context FROM agents WHERE id = ?", params: [opts.agentId] }) as Array<{ model: string; sleep_context: Record<string, unknown> | null }>;
        const row = rows[0];
        if (!row) throw new Error("Agent not found");
        const model = opts.model ?? row.model;
        const projection = await ctx.fns.compaction.project({ model, messages: await ctx.fns.session.getFullMessages({ id: opts.agentId }), sleepContext: row.sleep_context });
        // Local estimates are scaled by the per-model provider calibration; provider counts are not.
        const { factor } = await ctx.fns.compaction.calibration({ model });
        const estimate = async () => Math.round(factor * (opts.fallbackTokens ?? await ctx.fns.compaction.estimateTokens({ messages: projection.messages, model })));
        const usageRows = await ctx.fns.procs.db.select({ sql: "SELECT payload, ts FROM events WHERE agent_id = ? AND type = 'context_usage' ORDER BY idx DESC LIMIT 1", params: [opts.agentId] }) as Array<{ payload: unknown; ts: number | string }>;
        let payload: any = null;
        try { payload = typeof usageRows[0]?.payload === "string" ? JSON.parse(usageRows[0].payload) : usageRows[0]?.payload ?? null; } catch { payload = null; }
        const prompt = Number(payload?.usage?.prompt_tokens);
        const reportedAt = usageRows[0] ? Number(usageRows[0].ts) : null;
        const reportedTokens = Number.isFinite(prompt) && prompt >= 0 ? prompt : null;
        const coveredIdx = Number(payload?.coveredIdx);
        // Usage before the active checkpoint, from another model, or without a
        // coverage boundary cannot describe the context that will be sent next.
        const fresh = reportedTokens !== null && Number.isSafeInteger(coveredIdx) && payload?.model === model
            && (projection.mode !== "compact" || Number(reportedAt ?? 0) > Number(projection.activatedAt ?? 0));
        if (!fresh) return { tokens: await estimate(), source: "estimate", reportedTokens, deltaTokens: null, reportedAt };
        const own = await ctx.fns.session.getMessages({ id: opts.agentId });
        const delta = own.filter(m => Number(m.idx) > coveredIdx);
        const deltaTokens = delta.length ? Math.round(factor * await ctx.fns.compaction.estimateTokens({ messages: delta, model })) : 0;
        return { tokens: reportedTokens + deltaTokens, source: "provider", reportedTokens, deltaTokens, reportedAt };
}
