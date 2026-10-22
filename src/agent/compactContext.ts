/**
 * Compact idle context, or an owned run at a completed tool-batch boundary, into a hidden summary and verbatim tail
 *
 * Use for manual, non-destructive context compaction. It summarizes the current effective projection, preserves a safe recent tail, and atomically activates only when the root transcript and compact head remain unchanged.
 * @param opts.agent Live root agent whose effective model context is compacted.
 * @param opts.instructions Optional focus instructions appended to the handoff summarizer prompt.
 * @param opts.runToken Owning worker token for a completed tool-batch boundary.
 * @param opts.signal Owning run signal; cancellation prevents activation.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Live root agent whose effective model context is compacted. */
        agent: types.agent.Agent;
        /** Optional focus instructions appended to the handoff summarizer prompt. */
        instructions?: string;
        /** Owning worker token, supplied only at a completed tool-batch boundary. */
        runToken?: string;
        /** Owning run cancellation signal; required for mid-turn compaction. */
        signal?: AbortSignal;
    },
): Promise<{ status: "compacted" | "not_needed" | "stale"; revision?: number; tokensBefore: number; tokensAfter?: number; keptMessages?: number; summary?: string }> {
    const parent = opts.agent;
    const midTurn = !!opts.signal;
    const controller = parent.abortController;
    const ownsRun = () => !midTurn || (controller?.signal === opts.signal && parent.abortController === controller && !opts.signal!.aborted && (parent.activeRunCount ?? 0) === 1 && (parent.currentJobId ?? undefined) === opts.runToken);
    const ownershipSql = midTurn && opts.runToken ? "run_state = 'running' AND run_token = ?" : "run_state = 'idle' AND run_token IS NULL";
    const ownershipParams = midTurn && opts.runToken ? [opts.runToken] : [];
    if (!ownsRun() || (!midTurn && (parent.activeRunCount ?? 0) > 0)) throw new Error("compaction run ownership lost");
    const estimate = (messages: any[]) => Math.ceil(messages.reduce((n: number, m: any) => n + (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content ?? "").length) + JSON.stringify(m.tool_calls ?? []).length, 0) / 4);
    const compactMessage = (m: any) => ({ role: m.role, content: m.content, ...(m.message_type ? { message_type: m.message_type } : {}), ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}), ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}) });
    const rootMessages = await ctx.fns.session.getMessages({ id: parent.id });
    const sourceFrontier = rootMessages.length;
    const row = ((await ctx.fns.procs.db.select({ sql: "SELECT updated_at, run_state, run_token, sleep_context, last_error FROM agents WHERE id = ? AND archived_at IS NULL", params: [parent.id] })) as any[])[0];
    if (!row) throw new Error("agent not found");
    if (midTurn && opts.runToken ? row.run_state !== "running" || row.run_token !== opts.runToken : row.run_state !== "idle" || row.run_token != null) throw new Error("agent run ownership mismatch");
    const fingerprintSql = "SELECT md5(COALESCE(jsonb_agg(to_jsonb(m) ORDER BY idx)::text, '[]')) AS fingerprint FROM messages m WHERE agent_id = ?";
    const fingerprint = ((await ctx.fns.procs.db.select({ sql: fingerprintSql, params: [parent.id] })) as any[])[0].fingerprint;
    // Capture must describe the messages read above, not a concurrent append/edit.
    if (JSON.stringify(await ctx.fns.session.getMessages({ id: parent.id })) !== JSON.stringify(rootMessages)) return { status: "stale", tokensBefore: estimate(rootMessages) };
    const sleep = ctx.fns.agent.normalizeSleepContext({ sleepContext: row.sleep_context });
    if (sleep?.draftRevision != null) throw new Error("compaction already running");
    const active = sleep ? ctx.fns.agent.getSleepGeneration({ sleepContext: sleep, kind: "active" }) : null;
    const oldHead = sleep?.activeRevision ?? null;
    const storedActive = active?.contextAgentId ? await ctx.fns.session.getMessages({ id: String(active.contextAgentId) }) : (active?.contextMessages ?? []);
    // Same view as buildLlmRequest: a foreign checkpoint is adapted, an unreadable one means the full transcript.
    const activeMessages = active ? ctx.fns.compaction.portable({ model: parent.model, producedBy: active.model, messages: storedActive }) : [];
    const effective = active && activeMessages ? [...activeMessages, ...rootMessages.slice(Math.max(0, Number(active.tailStart ?? active.sourceOffset ?? 0)))] : rootMessages;
    const tokensBefore = estimate(effective);
    let tailStart = rootMessages.length;
    let chars = 0;
    let textCount = 0;
    for (let i = rootMessages.length - 1; i >= 0; i--) {
      const m = rootMessages[i];
      if (!m) continue;
      const size = (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content ?? "").length) + JSON.stringify(m.tool_calls ?? []).length;
      if (chars + size > 120000 && textCount >= 5) break;
      chars += size; tailStart = i;
      if (typeof m.content === "string" && m.content.trim()) textCount++;
      if (chars >= 160000 && textCount >= 5) break;
    }
    while (tailStart > 0 && rootMessages[tailStart]?.role === "tool") tailStart--;
    if (tailStart > 0 && rootMessages[tailStart - 1]?.role === "assistant" && rootMessages[tailStart - 1]?.tool_calls?.length) tailStart--;
    if (tailStart <= Math.max(0, activeMessages ? Number(active?.tailStart ?? 0) : 0)) return { status: "not_needed", tokensBefore };
    const revision = Math.max(0, ...(sleep?.generations ?? []).map((g: any) => Number(g.revision ?? 0))) + 1;
    const createdAt = Date.now();
    const draftOwner = ((ctx.state as any).compactionOwner ??= crypto.randomUUID());
    const child = await ctx.fns.agent.start({ model: parent.model, systemPrompt: parent.systemPrompt, title: (parent.title || parent.id) + " · compact", workspaceDir: parent.workspaceDir, workspaceHost: parent.workspaceHost, parentId: parent.id, forkOffset: 0, visibility: "hidden" });
    child.scratchpad = { compaction: { sourceAgentId: parent.id, revision, status: "draft" } };
    await ctx.fns.session.updateScratchpad({ id: child.id, scratchpad: child.scratchpad });
    const generation: any = { revision, kind: "compaction", status: "draft", contextAgentId: child.id, sourceAgentId: parent.id, sourceOffset: sourceFrontier, sourceFrontier, tailStart, summary: "", ...(opts.instructions?.trim() ? { instructions: opts.instructions.trim() } : {}), tokensBefore, tokensAfter: 0, model: parent.model, createdAt };
    const draftContext = { mode: sleep?.mode ?? "full", activeRevision: oldHead, draftRevision: revision, draftOwner, generations: [...(sleep?.generations ?? []), generation].slice(-8) };
    const draftAt = Date.now();
    if (!ownsRun()) { await ctx.fns.session.archive({ id: child.id }); return { status: "stale", tokensBefore }; }
    const drafted = await ctx.fns.procs.db.transaction({ fn: async () => {
      await ctx.fns.procs.db.select({ sql: 'SELECT id FROM agents WHERE id=? FOR UPDATE', params: [parent.id] });
      return await ctx.fns.procs.db.run({ sql: `UPDATE agents SET sleep_context = ?::jsonb, updated_at = ? WHERE id = ? AND updated_at = ? AND ${ownershipSql} AND sleep_context->>'draftRevision' IS NULL AND (SELECT md5(COALESCE(jsonb_agg(to_jsonb(m) ORDER BY idx)::text, '[]')) FROM messages m WHERE agent_id=?)=?`, params: [JSON.stringify(draftContext), draftAt, parent.id, Number(row.updated_at), ...ownershipParams, parent.id, fingerprint] });
    } }) as { changes: number };
    if (!drafted.changes) { await ctx.fns.session.archive({ id: child.id }).catch(() => undefined); return { status: "stale", tokensBefore }; }
    parent.sleepContext = draftContext;
    try {
      await ctx.fns.session.appendEventWithHtml({ id: parent.id, type: "compaction_start", payload: { revision } });
      // Provider-specific strategy from `$compaction_<provider>.ts`, else `$compaction_default.ts`.
      const compactor = (await ctx.fns.compaction.resolve({ model: child.model }));
      const instructions = await ctx.fns.agent.fullSystemPrompt({ agent: parent });
      opts.signal?.throwIfAborted();
      let onAbort: (() => void) | undefined;
      const aborted = opts.signal ? new Promise<never>((_, reject) => {
        onAbort = () => reject(new DOMException('Compaction aborted', 'AbortError'));
        opts.signal!.addEventListener('abort', onAbort, { once: true });
      }) : null;
      const pendingSummary = compactor.compact(ctx, session, {
        model: child.model,
        sessionId: child.id,
        instructions,
        focus: opts.instructions?.trim() || undefined,
        messages: effective.map(compactMessage),
        signal: opts.signal,
      });
      const result = await (aborted ? Promise.race([pendingSummary, aborted]) : pendingSummary).finally(() => {
        if (onAbort) opts.signal!.removeEventListener('abort', onAbort);
      });
      const summary = result.summary;
      const summaryMessage: any = result.message;
      const tokensAfter = estimate([summaryMessage, ...rootMessages.slice(tailStart)]);
      generation.compactor = compactor.provider;
      await ctx.fns.session.appendMessage({ id: child.id, message: summaryMessage });
      const currentCount = (await ctx.fns.session.getMessages({ id: parent.id })).length;
      const currentRow = ((await ctx.fns.procs.db.select({ sql: "SELECT updated_at, run_state, run_token, sleep_context, last_error FROM agents WHERE id = ?", params: [parent.id] })) as any[])[0];
      const currentSleep = ctx.fns.agent.normalizeSleepContext({ sleepContext: currentRow?.sleep_context });
      const valid = tokensAfter < tokensBefore && !(String(currentRow?.last_error ?? '').startsWith('stopped by user') && currentRow?.last_error !== row.last_error) && ownsRun() && (midTurn && opts.runToken ? currentRow?.run_state === "running" && currentRow?.run_token === opts.runToken : currentRow?.run_state === "idle" && currentRow?.run_token == null) && currentCount === sourceFrontier && currentSleep?.draftRevision === revision && currentSleep?.activeRevision === oldHead;
      if (!valid) {
        generation.status = "stale"; generation.summary = summary;
        const stale = { ...draftContext, draftRevision: null, draftOwner: null, generations: draftContext.generations.map((g: any) => g.revision === revision ? generation : g) };
        await ctx.fns.procs.db.run({ sql: "UPDATE agents SET sleep_context = ?::jsonb WHERE id = ? AND sleep_context->>'draftRevision' = ? AND sleep_context->>'draftOwner' = ? AND (sleep_context->>'activeRevision') IS NOT DISTINCT FROM ?", params: [JSON.stringify(stale), parent.id, String(revision), draftOwner, oldHead == null ? null : String(oldHead)] });
        await ctx.fns.session.syncAgentState({ agent: parent });
        return { status: "stale", tokensBefore };
      }
      Object.assign(generation, { status: "active", summary, tokensAfter, activatedAt: Date.now() });
      const next = { mode: "compact", activeRevision: revision, draftRevision: null, draftOwner: null, generations: draftContext.generations.map((g: any) => g.revision === revision ? generation : g) };
      const activated = await ctx.fns.procs.db.transaction({ fn: async () => {
        await ctx.fns.procs.db.select({ sql: 'SELECT id FROM agents WHERE id=? FOR UPDATE', params: [parent.id] });
        if (!ownsRun()) return { changes: 0 };
        return await ctx.fns.procs.db.run({ sql: `UPDATE agents SET sleep_context = ?::jsonb, updated_at = ? WHERE id = ? AND updated_at = ? AND ${ownershipSql} AND sleep_context->>'draftRevision' = ? AND sleep_context->>'draftOwner' = ? AND (sleep_context->>'activeRevision') IS NOT DISTINCT FROM ? AND (SELECT md5(COALESCE(jsonb_agg(to_jsonb(m) ORDER BY idx)::text, '[]')) FROM messages m WHERE agent_id = ?) = ?`, params: [JSON.stringify(next), generation.activatedAt, parent.id, Number(currentRow.updated_at), ...ownershipParams, String(revision), draftOwner, oldHead == null ? null : String(oldHead), parent.id, fingerprint] });
      } }) as { changes: number };
      if (!activated.changes) {
        generation.status = "stale";
        delete generation.activatedAt;
        const stale = { ...draftContext, draftRevision: null, draftOwner: null, generations: draftContext.generations.map((g: any) => g.revision === revision ? generation : g) };
        await ctx.fns.procs.db.run({ sql: "UPDATE agents SET sleep_context = ?::jsonb WHERE id = ? AND sleep_context->>'draftRevision' = ? AND sleep_context->>'draftOwner' = ? AND (sleep_context->>'activeRevision') IS NOT DISTINCT FROM ?", params: [JSON.stringify(stale), parent.id, String(revision), draftOwner, oldHead == null ? null : String(oldHead)] });
        await ctx.fns.session.syncAgentState({ agent: parent });
        await ctx.fns.session.archive({ id: child.id }).catch(() => undefined);
        return { status: "stale", tokensBefore };
      }
      parent.sleepContext = next;
      await ctx.fns.session.appendEventWithHtml({ id: parent.id, type: "compaction_completed", payload: { revision, tokensBefore, tokensAfter, keptMessages: rootMessages.length - tailStart, summary } });
      // The draft child has done its only job. Archive it here and in the catch
      // below: otherwise every compaction — successful or failed — leaves a hidden
      // agent row behind that later looks like unfinished delegated work.
      await ctx.fns.session.archive({ id: child.id }).catch(() => undefined);
      return { status: "compacted", revision, tokensBefore, tokensAfter, keptMessages: rootMessages.length - tailStart, summary };
    } catch (error: any) {
      generation.status = "failed";
      const failed = { ...draftContext, draftRevision: null, draftOwner: null, generations: draftContext.generations.map((g: any) => g.revision === revision ? generation : g) };
      await ctx.fns.procs.db.run({ sql: "UPDATE agents SET sleep_context = ?::jsonb WHERE id = ? AND sleep_context->>'draftRevision' = ? AND sleep_context->>'draftOwner' = ? AND (sleep_context->>'activeRevision') IS NOT DISTINCT FROM ?", params: [JSON.stringify(failed), parent.id, String(revision), draftOwner, oldHead == null ? null : String(oldHead)] }).catch(() => undefined);
      await ctx.fns.session.syncAgentState({ agent: parent });
      await ctx.fns.session.appendEventWithHtml({ id: parent.id, type: "compaction_failed", payload: { revision, error: String(error?.message ?? error) } }).catch(() => undefined);
      await ctx.fns.session.archive({ id: child.id }).catch(() => undefined);
      throw error;
    } finally {
      // Durable rows survive projection failures; the worker recovery sweep retries.
      await ctx.fns.session.deliverInbound({ id: parent.id }).catch(async (error) => {
        await ctx.fns.procs.log.warn({ event: 'compaction.inbound.drain.failed', msg: String(error), agentId: parent.id });
      });
    }
}
