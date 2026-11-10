/**
 * Compact oversized context after a successful turn or at an owned completed tool batch
 *
 * Estimate the effective context after a completed run and invoke the provider's `$compaction_<provider>` compactor (or `$compaction_default`) when it exceeds the threshold: the smaller of the global `autoCompactTokens` setting and the per-agent `autoCompactWindowPercent` override (or the dynamically inherited global percentage) of the model's context window (Claude 200K, Codex 272K). The size is the larger of an image-aware local estimate and the latest provider-reported request plus completion tokens, including tool-only responses. Skip agents without a compactor, running, already compacted, or too-small agents; failures are recorded as events but do not fail the completed user turn.
 * @param opts.agent Live agent to inspect after its run has finalized.
 * @param opts.thresholdTokens Token threshold overriding both settings. @minimum 10000
 * @param opts.runToken Worker ownership token at a completed tool batch.
 * @param opts.checkOnly Measure without another summary attempt after a failure. @default false
 * @param opts.signal Owning run signal for guarded mid-turn compaction.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Live agent to inspect after its run has finalized. */
        agent: types.agent.Agent;
        /** Token threshold overriding both settings. @minimum 10000 */
        thresholdTokens?: number;
        /** Owning worker token at a completed tool-batch boundary. */
        runToken?: string;
        /** Owning run signal; enables guarded mid-turn compaction. */
        signal?: AbortSignal;
        /** Only measure context after a failed attempt; never call the summarizer. @default false */
        checkOnly?: boolean;
    },
): Promise<{ status: "compacted" | "below_threshold" | "no_compactor" | "already_compact" | "busy" | "failed" | "stale" | "not_needed" | "over_threshold"; estimatedTokens: number; source?: "provider" | "estimate"; threshold?: number; contextWindow?: number; error?: string }> {
    const agent = opts.agent;
    let hasCompactor = true;
    try { (await ctx.fns.compaction.resolve({ model: agent.model })); } catch { hasCompactor = false; }
    const row = ((await ctx.fns.procs.db.select({ sql: "SELECT run_state, run_token, sleep_context FROM agents WHERE id = ? AND archived_at IS NULL", params: [agent.id] })) as any[])[0];
    if (!row || (opts.signal && opts.runToken ? row.run_state !== "running" || row.run_token !== opts.runToken : row.run_state !== "idle" || row.run_token != null)) return { status: "busy", estimatedTokens: 0 };
    if (opts.signal && (opts.signal.aborted || agent.abortController?.signal !== opts.signal || (agent.activeRunCount ?? 0) !== 1)) return { status: "busy", estimatedTokens: 0 };
    const root = agent.parentId ? await ctx.fns.session.getFullMessages({ id: agent.id }) : await ctx.fns.session.getMessages({ id: agent.id });
    const projection = await ctx.fns.compaction.project({ model: agent.model, messages: root, sleepContext: row.sleep_context });
    const effective = projection.messages;
    // One shared measurement: the latest provider-reported prompt plus an
    // estimate of only the messages persisted after that request.
    const measured = await ctx.fns.agent.contextTokens({ agentId: agent.id, model: agent.model, fallbackTokens: await ctx.fns.compaction.estimateTokens({ messages: effective }) });
    const estimatedTokens = measured.tokens;
    const source = measured.source;
    const configured = await ctx.fns.settings.getNumber({ module: "agent", scopeType: "global", key: "autoCompactTokens", fallback: 700000 });
    const percent = agent.autoCompactWindowPercent ?? await ctx.fns.settings.getNumber({ module: "agent", scopeType: "global", key: "autoCompactWindowPercent", fallback: 65 });
    const window = (await ctx.fns.compaction.contextWindow({ model: agent.model }));
    const byWindow = window ? Math.floor(window * Math.min(95, Math.max(15, Number(percent ?? 65))) / 100) : Infinity;
    const threshold = Math.max(10000, Number(opts.thresholdTokens ?? Math.min(Number(configured ?? 700000), byWindow)));
    if (!hasCompactor) return { status: 'no_compactor', estimatedTokens, source, threshold, contextWindow: window ?? undefined };
    if (opts.checkOnly) return { status: estimatedTokens < threshold ? 'below_threshold' : 'over_threshold', estimatedTokens, source, threshold, contextWindow: window ?? undefined };
    if (projection.mode === 'compact' && projection.tailStart !== null && projection.tailStart >= root.length - 1) return { status: "already_compact", estimatedTokens, source, threshold, contextWindow: window ?? undefined };
    if (estimatedTokens < threshold) return { status: "below_threshold", estimatedTokens, source, threshold, contextWindow: window ?? undefined };
    try { const result = await ctx.fns.agent.compactContext({ agent, runToken: opts.runToken, signal: opts.signal }); return { status: result.status, estimatedTokens, source, threshold, contextWindow: window ?? undefined }; }
    catch (error: any) { const message = String(error?.message ?? error); await ctx.fns.session.appendEventWithHtml({ id: agent.id, type: "auto_compaction_failed", payload: { estimatedTokens, error: message } }).catch(() => undefined); return { status: "failed", estimatedTokens, source, error: message }; }
}
