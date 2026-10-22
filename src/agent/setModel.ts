// Changing the model of a LIVE agent — previously impossible: the model was
// fixed at creation, so an exhausted subscription left the only choice of
// waiting. This is the manual half of the parking story: switch model, or
// switch to another credential of the same provider, and continue now.
/** Switches an inactive agent to another model or credential account. */
/**
 * Point an existing agent at a different model, provider or credential account.
 *
 * Rejects active worker/direct runs before changing any target; idle agents,
 * including usage-limit parked agents, can still switch through the UI.
 * Validates the target through llm.resolveEndpoint (unknown provider or a
 * missing key fails here rather than on the next request), records a visible
 * transcript event, and lifts a usage-limit parking so the interrupted work
 * resumes immediately on the new model.
 *
 * @param opts.id Agent whose model changes.
 * @param opts.model Target model as "provider[/account]:modelId".
 * @param opts.scope Apply to this agent only, or to every agent sharing its parked credential.
 * @param opts.now Current time in ms, for testing.
 * @param opts.expectedModel Optional exact previously observed route; rejects stale per-agent parameter edits.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Agent identifier. */
        id: string;
        /** Target model string, e.g. "kimi-coding:k3" or "codex/personal:gpt-5.6-sol". */
        model: string;
        /** "agent" changes one agent; "provider" changes every agent parked on the same credential. @default "agent" */
        scope?: "agent" | "provider";
        /** Current timestamp in ms; defaults to Date.now(). */
        now?: number;
        /** Require the agent route to equal this observed value before applying an agent-scoped edit. */
        expectedModel?: string;
    },
): Promise<{ changed: string[]; model: string; from: string | null }> {
    const model = String(opts.model ?? "").trim();
    const now = opts.now ?? Date.now();
    if (!model) throw new Error("setModel: model is required");
    if (opts.expectedModel !== undefined && opts.scope === "provider") throw new Error("setModel: expectedModel requires agent scope");

    // Fail here, loudly, instead of on the agent's next turn.
    const endpoint = await ctx.fns.llm.resolveEndpoint({ model });
    if (!endpoint.apiKey && !endpoint.ssh && endpoint.kind !== "local" && endpoint.provider !== "opencode" && endpoint.provider !== "claude-code" && endpoint.provider !== "anthropic-oauth") {
        throw new Error(`setModel: no credential for ${endpoint.provider}/${endpoint.account} — add a key or log in first`);
    }

    const row = ((await ctx.fns.procs.db.select({
        sql: "SELECT id, model, scratchpad FROM agents WHERE id = ? AND archived_at IS NULL",
        params: [opts.id],
    })) as any[])[0];
    if (!row) throw new Error(`setModel: agent not found: ${opts.id}`);
    const from = row.model ? String(row.model) : null;
    if (opts.expectedModel !== undefined && from !== opts.expectedModel) throw new Error("setModel: model changed; reopen settings and retry");

    let targets = [String(row.id)];
    if (opts.scope === "provider") {
        // "Move everyone off the credential that ran out" — the common case when
        // a whole group of agents was parked by one exhausted plan.
        let parked: any = null;
        try { parked = JSON.parse(String(row.scratchpad ?? "{}"))?.parked ?? null; } catch { parked = null; }
        if (parked?.provider) {
            const rows = (await ctx.fns.procs.db.select({
                sql: "SELECT id, model FROM agents WHERE archived_at IS NULL AND model IS NOT NULL",
                params: [],
            })) as any[];
            targets = [];
            for (const r of rows) {
                const parsed = await splitModel(ctx, String(r.model ?? ""));
                if (parsed.provider === parked.provider && parsed.account === (parked.account ?? "default")) targets.push(String(r.id));
            }
            if (!targets.includes(String(row.id))) targets.push(String(row.id));
        }
    }

    // Preflight the whole group before the first mutation. A stale controller
    // is not evidence of a live run; activeRunCount tracks direct-run lifetime.
    const prepared: { id: string; previous: string | null }[] = [];
    for (const id of targets) {
        const before = ((await ctx.fns.procs.db.select({ sql: "SELECT model, run_state FROM agents WHERE id = ? AND archived_at IS NULL", params: [id] })) as any[])[0];
        if (!before) throw new Error(`setModel: agent not found: ${id}`);
        const previous = before.model ? String(before.model) : null;
        if (opts.expectedModel !== undefined && previous !== opts.expectedModel) throw new Error("setModel: model changed; reopen settings and retry");
        const live = (ctx.state as any).agent?.[id];
        if (previous === model && (!live || live.model === model)) continue;
        if (before.run_state === "running" || Number(live?.activeRunCount ?? 0) > 0) {
            throw new Error(`setModel: agent ${id} is running; wait for the run to finish`);
        }
        prepared.push({ id, previous });
    }
    const changed: string[] = [];
    for (const { id, previous } of prepared) {
        const live = (ctx.state as any).agent?.[id];
        // The live object is what the next turn reads. A row edited behind the
        // process (SQL, migration) can already say the new model while the agent
        // in memory still runs the old one — that drift is exactly a switch.
        if (previous === model && (!live || live.model === model)) continue;
        // The last error belonged to the old model; leaving it makes the status
        // bar keep shouting about a credential the agent no longer uses.
        // Recheck after async preflight, then CAS against a worker claim or
        // another model switch. Direct runs still lack a durable DB lease.
        if (Number(live?.activeRunCount ?? 0) > 0) throw new Error(`setModel: agent ${id} is running; wait for the run to finish`);
        const updated = await ctx.fns.procs.db.run({
            sql: "UPDATE agents SET model = ?, last_error = NULL, updated_at = ? WHERE id = ? AND archived_at IS NULL AND run_state = 'idle' AND model IS NOT DISTINCT FROM ?",
            params: [model, now, id, previous],
        });
        if (!updated.changes) throw new Error(`setModel: agent ${id} is running or changed; retry after it is idle`);
        const liveBefore = live?.model ?? previous;
        if (live) live.model = model;
        await ctx.fns.session.appendEvent({ id, event: { type: "model_changed", from: liveBefore, to: model } }).catch(() => undefined);
        // A new model means a new quota. If lifting the parking fails, roll the
        // model back and fail the operation — returning success with a new
        // model but an old wake/park mark strands the unanswered work.
        try {
            await ctx.fns.agent.unpark({ id, reason: "model-switch", now });
        } catch (error) {
            await ctx.fns.procs.db.run({
                sql: "UPDATE agents SET model = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL",
                params: [previous, Date.now(), id],
            }).catch(() => undefined);
            if (live) live.model = previous;
            throw error;
        }
        ctx.fns.events.refreshAgentMeta({ agentId: id, section: "wake", reason: "model-changed" });
        changed.push(id);
        // A checkpoint the new model cannot read falls back to the full
        // transcript (compaction.portable); re-compact for the new window now
        // rather than overflowing on the next turn. Background, best effort.
        const switched = live ?? await ctx.fns.session.load({ id }).catch(() => null);
        if (switched) void ctx.fns.agent.autoCompactIfNeeded({ agent: switched }).catch(() => undefined);
    }
    if (changed.length) { try { ctx.fns.events.emitAgentsChanged({}); } catch {} }

    return { changed, model, from };
}

async function splitModel(ctx: Context, model: string): Promise<{ provider: string; account: string }> {
    const m = /^([a-z][\w\-]*)(?:\/([\w\-.]+))?:(.+)$/.exec(model);
    const provider = m?.[1] ?? "lmstudio", account = m?.[2] ?? "default";
    if (provider === "ssh") {
        const inner = /^(codex|claude-code)\/([\w-]+):/.exec(m?.[3] ?? "");
        if (inner) return { provider: inner[1]!, account: `ssh.${account}.${inner[2]}` };
    }
    if (provider !== "hyper") return { provider, account };
    const id = m![3]!;
    const canonical = /^([a-z][\w\-]*)\/([\w\-.]+):/.exec(id);
    if (canonical) return { provider, account: `${account}/${canonical[1]}/${canonical[2]}` };
    const node = await ctx.fns.node.get({ name: account });
    const exact = (node?.catalog ?? []).filter((e) => e.id === id);
    const matches = exact.length ? exact : id.includes(":") ? [] : (node?.catalog ?? []).filter((e) => e.id.slice(e.id.indexOf(":") + 1) === id);
    const entry = matches.length === 1 ? matches[0] : null;
    return { provider, account: entry ? `${account}/${entry.provider}/${entry.account ?? "default"}` : `${account}/unresolved/${id}` };
}
