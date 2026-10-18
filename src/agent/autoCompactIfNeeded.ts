/**
 * Compact oversized context after a successful turn or at an owned completed tool batch
 *
 * Estimate the effective context after a completed run and invoke the provider's `$compaction_<provider>` compactor (or `$compaction_default`) when it exceeds the threshold: the smaller of the global `autoCompactTokens` setting and `autoCompactWindowPercent` of the model's context window (Claude 200K, Codex 272K). The size is the larger of a chars/4 estimate and the last provider-reported prompt tokens. Skip agents without a compactor, running, already compacted, or too-small agents; failures are recorded as events but do not fail the completed user turn.
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
): Promise<{ status: "compacted" | "below_threshold" | "no_compactor" | "already_compact" | "busy" | "failed" | "stale" | "not_needed" | "over_threshold"; estimatedTokens: number; threshold?: number; contextWindow?: number; error?: string }> {
    const agent = opts.agent;
    const estimate = (messages: any[]) => Math.ceil(messages.reduce((n: number, m: any) => n + (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content ?? "").length) + JSON.stringify(m.tool_calls ?? []).length, 0) / 4);
    let hasCompactor = true;
    try { (await ctx.fns.compaction.resolve({ model: agent.model })); } catch { hasCompactor = false; }
    const row = ((await ctx.fns.procs.db.select({ sql: "SELECT run_state, run_token, sleep_context FROM agents WHERE id = ? AND archived_at IS NULL", params: [agent.id] })) as any[])[0];
    if (!row || (opts.signal && opts.runToken ? row.run_state !== "running" || row.run_token !== opts.runToken : row.run_state !== "idle" || row.run_token != null)) return { status: "busy", estimatedTokens: 0 };
    if (opts.signal && (opts.signal.aborted || agent.abortController?.signal !== opts.signal || (agent.activeRunCount ?? 0) !== 1)) return { status: "busy", estimatedTokens: 0 };
    const sleep = ctx.fns.agent.normalizeSleepContext({ sleepContext: row.sleep_context });
    const active = sleep ? ctx.fns.agent.getSleepGeneration({ sleepContext: sleep, kind: "active" }) : null;
    const root = await ctx.fns.session.getMessages({ id: agent.id });
    const storedActive = active?.contextAgentId ? await ctx.fns.session.getMessages({ id: String(active.contextAgentId) }) : (active?.contextMessages ?? []);
    // Same view as buildLlmRequest: a foreign checkpoint is adapted, an unreadable one means the full transcript.
    const activeMessages = active ? ctx.fns.compaction.portable({ model: agent.model, producedBy: active.model, messages: storedActive }) : [];
    const effective = active && activeMessages ? [...activeMessages, ...root.slice(Math.max(0, Number(active.tailStart ?? active.sourceOffset ?? 0)))] : root;
    // chars/4 underestimates code and JSON; the provider's own count of the last
    // request is authoritative when it exists (it predates this turn's reply).
    const last = ((await ctx.fns.procs.db.select({ sql: "SELECT payload, ts FROM events WHERE agent_id = ? AND type = 'assistant' ORDER BY idx DESC LIMIT 1", params: [agent.id] })) as any[])[0];
    let reported = 0;
    try { const usage = JSON.parse(String(last?.payload ?? "{}"))?.usage ?? {}; reported = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) + Number(usage.completion_tokens ?? usage.output_tokens ?? 0); } catch {}
    // A usage recorded before the active compaction describes the old, larger context.
    const fresh = !active || Number(last?.ts ?? 0) > Number(active.activatedAt ?? 0);
    const estimatedTokens = Math.max(estimate(effective), fresh ? reported : 0);
    const configured = await ctx.fns.settings.getNumber({ module: "agent", scopeType: "global", key: "autoCompactTokens", fallback: 700000 });
    const percent = await ctx.fns.settings.getNumber({ module: "agent", scopeType: "global", key: "autoCompactWindowPercent", fallback: 65 });
    const window = (await ctx.fns.compaction.contextWindow({ model: agent.model }));
    const byWindow = window ? Math.floor(window * Math.min(95, Math.max(30, Number(percent ?? 65))) / 100) : Infinity;
    const threshold = Math.max(10000, Number(opts.thresholdTokens ?? Math.min(Number(configured ?? 700000), byWindow)));
    if (!hasCompactor) return { status: 'no_compactor', estimatedTokens, threshold, contextWindow: window ?? undefined };
    if (opts.checkOnly) return { status: estimatedTokens < threshold ? 'below_threshold' : 'over_threshold', estimatedTokens, threshold, contextWindow: window ?? undefined };
    if (active && activeMessages && active.tailStart >= root.length - 1) return { status: "already_compact", estimatedTokens, threshold, contextWindow: window ?? undefined };
    if (estimatedTokens < threshold) return { status: "below_threshold", estimatedTokens, threshold, contextWindow: window ?? undefined };
    try { const result = await ctx.fns.agent.compactContext({ agent, runToken: opts.runToken, signal: opts.signal }); return { status: result.status, estimatedTokens, threshold, contextWindow: window ?? undefined }; }
    catch (error: any) { const message = String(error?.message ?? error); await ctx.fns.session.appendEventWithHtml({ id: agent.id, type: "auto_compaction_failed", payload: { estimatedTokens, error: message } }).catch(() => undefined); return { status: "failed", estimatedTokens, error: message }; }
}
