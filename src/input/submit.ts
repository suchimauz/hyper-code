// The one way an input leaves "open": a person submits or cancels it, or the
// agent withdraws it. The row is claimed with a conditional UPDATE, so a double
// click or two tabs answer exactly once; the kind's submit runs while the row
// is "processing" and a validation error puts it back to "open".
/**
 * Answers an open chat input: runs the kind's submit on the form values (or cancels), stores the result and wakes the agent with it.
 *
 * Used by the POST /input/<id> route; callable directly to answer or withdraw an input
 * programmatically. Returns the new state and, on a validation failure, the message to show
 * under the still-open form. A second answer to the same input is a no-op.
 * Answers and cancellations preserve Stop and plan pauses atomically with
 * transcript delivery and scheduling; an `agent:<id>` withdrawal preserves pauses.
 * Protected kinds reject generic submission and require their dedicated authenticated handler.
 * @param opts.id Input identifier.
 * @param opts.values Submitted form fields; a repeated name is an array.
 * @param opts.cancel Cancel instead of submitting.
 * @param opts.reason Why it was cancelled, shown on the card and sent to the agent.
 * @param opts.actor Who answered: a user id, or `agent:<id>` when an agent withdraws it.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Input identifier. */
    id: string;
    /** Submitted form fields; a repeated name is an array. */
    values?: Record<string, string | string[]>;
    /** Cancel instead of submitting. */
    cancel?: boolean;
    /** Why it was cancelled, shown on the card and sent to the agent. */
    reason?: string;
    /** Who answered: a user id, or `agent:<id>` when an agent withdraws it. */
    actor?: string | null;
}): Promise<{ state: string; error?: string }> {
    const [gate] = await ctx.fns.procs.db.select({ sql: "SELECT agent_id, spec->>'_agentWait' = 'true' AS blocking FROM inputs WHERE id = ?", params: [String(opts.id ?? '')] });
    if (gate) {
        // Protected external actions use dedicated handlers, never this generic path. Keep their claim,
        // validation and delivery in one transaction: process death rolls back to open.
        const result = await ctx.fns.procs.db.transaction({ fn: async () => {
            await ctx.fns.procs.db.select({ sql: 'SELECT id FROM agents WHERE id = ? FOR UPDATE', params: [gate.agent_id] });
            return await submitInput(ctx, opts, true);
        } });
        const live = (ctx.state as any).agent?.[gate.agent_id];
        if (live) await ctx.fns.session.syncAgentState({ agent: live });
        // The owner handled this request here: withdraw the notification from their other devices.
        // The transaction above has committed, so the notification can no longer come back.
        await ctx.fns.webPush?.recall?.({ inputId: String(opts.id ?? '') }).catch(() => undefined);
        ctx.fns.procs.events.refresh({ topic: `agent:${gate.agent_id}`, reason: 'input' });
        ctx.fns.agent.wakeWorker({});
        return result as { state: string; error?: string };
    }
    return await submitInput(ctx, opts, false);
}

async function submitInput(ctx: Context, opts: { id: string; values?: Record<string, string | string[]>; cancel?: boolean; reason?: string; actor?: string | null }, atomic: boolean): Promise<{ state: string; error?: string }> {
    const id = String(opts.id ?? "");
    // This kind has a separate exact-plan browser transition; generic calls may neither approve nor cancel it.
    const existingInput = await ctx.fns.input.get({ id });
    if (existingInput && ((ctx.state as any).input?.kinds?.[existingInput.kind]?.completionAuthority || existingInput.kind === 'planning-review')) return { state: existingInput.state, error: 'Use this input kind’s dedicated human controls' };
    const [deadline] = await ctx.fns.procs.db.select({sql: "SELECT (CASE WHEN spec->>'_expiresAt' ~ '^[0-9]{1,16}$' THEN (spec->>'_expiresAt')::bigint END) AS expires_at FROM inputs WHERE id=?", params:[id]});
    if (deadline?.expires_at && Number(deadline.expires_at) <= Date.now()) {
        const expired = await ctx.fns.input.complete({id,state:"expired",summary:"Input expired before an answer was received",actor:"system:expiry"});
        return {state:expired.state};
    }
    const claimed = await ctx.fns.procs.db.run({
        sql: "UPDATE inputs SET state = 'processing', updated_at = ? WHERE id = ? AND state = 'open' RETURNING id",
        params: [Date.now(), id],
    });
    if (!claimed.rows.length) {
        const current = await ctx.fns.input.get({ id });
        if (!current) throw new Error(`input.submit: no input ${id}`);
        return { state: current.state };
    }
    const input = (await ctx.fns.input.get({ id }))!;
    const actor = opts.actor ?? null;

    if (opts.cancel) {
        const reason = String(opts.reason ?? "").trim() || null;
        await deliver(ctx, input, "cancelled", reason ? `cancelled: ${reason}` : "cancelled by the person", null, actor, reason, atomic);
        return { state: "cancelled" };
    }

    const kind = (ctx.state as any).input?.kinds?.[input.kind] as types.input.Registered | undefined;
    let outcome: types.input.Outcome;
    try {
        if (!kind) throw new Error(`input kind "${input.kind}" is not loaded`);
        outcome = await kind.submit(ctx, { input, values: opts.values ?? {} });
    } catch (error: any) {
        // Back to open: the person fixes the value and submits again.
        await ctx.fns.procs.db.run({ sql: "UPDATE inputs SET state = 'open', updated_at = ? WHERE id = ?", params: [Date.now(), id] });
        return { state: "open", error: String(error?.message ?? error) };
    }
    await deliver(ctx, input, "submitted", outcome.summary, outcome.result, actor, null, atomic);
    return { state: "submitted" };
}

async function finish(ctx: Context, input: types.input.Row, state: string, result: Record<string, any> | null, error: string | null, actor: string | null) {
    await ctx.fns.procs.db.run({
        sql: "UPDATE inputs SET state = ?, result = ?::jsonb, error = ?, answered_by = ?, updated_at = ? WHERE id = ?",
        params: [state, result == null ? null : JSON.stringify(result), error, actor, Date.now(), input.id],
    });
}

// The answer is a user turn of its own type: it wakes the agent like a typed
// message, but the composer-only machinery (function RAG, mentions) skips it.
// No transcript bubble — the input card itself now shows the answer.
async function deliver(ctx: Context, input: types.input.Row, state: string, summary: string, result: Record<string, any> | null, actor: string | null, reason: string | null = null, atomic = false) {
    const attr = (v: string) => v.replace(/[&"<>]/g, ch => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" }[ch]!));
    const content = `<input-result id="${attr(input.id)}" kind="${attr(input.kind)}" state="${state}" title="${attr(input.title)}">\n`
        + summary + (result ? `\n${JSON.stringify(result)}` : "") + `\n</input-result>`;
    const now = Date.now();
    const message: any = { role: "user", content, message_type: "input" };
    if (actor) message.author = actor;
    const persist = async () => {
        await ctx.fns.procs.db.select({ sql: "SELECT id FROM agents WHERE id=? FOR UPDATE", params: [input.agentId] });
        await finish(ctx, input, state, result, reason, actor);
        await ctx.fns.session.appendMessage({ id: input.agentId, message, ts: now });
        await ctx.fns.procs.db.run({
            sql: "UPDATE agents SET next_run_at = GREATEST(COALESCE(next_run_at, 0), ?), updated_at = ? WHERE id = ? AND archived_at IS NULL AND stopped_at IS NULL AND NOT EXISTS (SELECT 1 FROM inputs i WHERE i.agent_id=agents.id AND i.spec->>'_agentWait'='true' AND i.state IN ('open','processing')) AND NOT (COALESCE(scratchpad::jsonb,'{}'::jsonb)->'plan'->>'pausedAt' IS NOT NULL)",
            params: [now, now, input.agentId],
        });
    };
    if (atomic) await persist();
    else await ctx.fns.procs.db.transaction({ fn: persist });
    if (atomic) return; // Publish only after the enclosing claim transaction commits.
    const live = (ctx.state as any).agent?.[input.agentId];
    if (live) await ctx.fns.session.syncAgentState({ agent: live });
    ctx.fns.procs.events.refresh({ topic: `agent:${input.agentId}`, reason: "input" });
    ctx.fns.agent.wakeWorker({});
}
