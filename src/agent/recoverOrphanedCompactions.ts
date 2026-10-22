/**
 * Clears compaction drafts owned by a previous Hyper process
 *
 * Scan idle agents for durable compaction drafts whose process owner differs from the current runtime, mark those generations failed, and clear draftRevision so compaction and agent work can resume after a crash or restart. Safe to call repeatedly from the worker loop.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<{ recovered: string[] }> {
    const owner = ((ctx.state as any).compactionOwner ??= crypto.randomUUID());
    const rows = await ctx.fns.procs.db.select({ sql: "SELECT id, sleep_context FROM agents WHERE archived_at IS NULL AND run_state = 'idle' AND sleep_context IS NOT NULL AND sleep_context->>'draftRevision' IS NOT NULL", params: [] }) as any[];
    const recovered: string[] = [];
    for (const row of rows) {
      const sleep: any = ctx.fns.agent.normalizeSleepContext({ sleepContext: row.sleep_context });
      const revision = sleep?.draftRevision;
      if (revision == null || sleep?.draftOwner === owner) continue;
      const generations = (sleep.generations ?? []).map((g: any) => Number(g.revision) === Number(revision) ? { ...g, status: "failed", error: "compaction owner disappeared during restart" } : g);
      const next = { ...sleep, draftRevision: null, draftOwner: null, generations };
      const changed = await ctx.fns.procs.db.run({ sql: "UPDATE agents SET sleep_context=?::jsonb, updated_at=? WHERE id=? AND run_state='idle' AND sleep_context->>'draftRevision'=? AND COALESCE(sleep_context->>'draftOwner','')=?", params: [JSON.stringify(next), Date.now(), row.id, String(revision), String(sleep.draftOwner ?? "")] });
      if (changed.changes) { recovered.push(String(row.id)); const live=(ctx.state as any).agent?.[row.id]; if(live) live.sleepContext=next; await ctx.fns.session.appendEventWithHtml({ id:String(row.id), type:"compaction_failed", payload:{ revision, error:"recovered after interrupted Hyper process" } }).catch(()=>undefined); }
    }
    // This hot-reloaded function is called by existing worker closures too.
    const pending = await ctx.fns.procs.db.select({ sql: "SELECT DISTINCT d.agent_id FROM session_inbound_deliveries d JOIN agents a ON a.id=d.agent_id WHERE d.delivered_at IS NULL AND a.archived_at IS NULL AND a.sleep_context->>'draftRevision' IS NULL", params: [] });
    for (const row of pending) {
      try { await ctx.fns.session.deliverInbound({ id: String(row.agent_id) }); }
      catch (error) { await ctx.fns.procs.log.warn({ event: 'inbound.recovery.failed', msg: String(error), agentId: String(row.agent_id) }); }
    }
    // A compaction draft child is a throwaway context window. Any that never
    // reached a terminal state — a crash between spawn and archive, or an error
    // that rethrew past it — stays as a hidden agent row and reads as unfinished
    // delegated work forever. Archive those whose parent no longer holds their
    // revision as an active or draft generation.
    const orphans = await ctx.fns.procs.db.select({
      sql: `SELECT c.id FROM agents c JOIN agents p ON p.id = c.parent_id
            WHERE c.archived_at IS NULL AND c.title LIKE '%· compact'
              AND NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(p.sleep_context->'generations','[]'::jsonb)) g
                WHERE g->>'contextAgentId' = c.id AND g->>'status' IN ('draft','active'))`,
      params: [],
    }) as any[];
    const archived: string[] = [];
    for (const row of orphans) {
      const done: any = await ctx.fns.session.archive({ id: String(row.id) }).catch(() => null);
      if (done?.ok !== false) archived.push(String(row.id));
    }
    return { recovered: [...recovered, ...archived] };
}
