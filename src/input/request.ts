// Opens a form inside the chat and returns at once. The person answers when they
// like; the answer arrives to the agent as a new user turn (message_type
// "input"), so the agent ends its turn instead of waiting.
/**
 * Opens a live chat form and returns immediately; explicitly requested waits durably block further agent dispatch until answered or cancelled.
 * The tool batch ends at its next safe boundary, including when the answer arrives early.
 * Already-running JavaScript cannot be interrupted: call this last in an eval.
 * Any registered kind can wait; omission is nonblocking.
 *
 * The form stays in the transcript as its own card: open while waiting, then replaced in
 * place by the answer. On submit or cancel the agent is woken with a user turn
 * `<input-result id kind state>` carrying a one-line summary and a JSON result (a secret
 * kind returns only its secret:// reference, never the value). End the turn after
 * calling; do not poll. Available kinds and their spec are listed in the system prompt
 * under "Chat inputs" (input.kinds returns them too).
 * @param opts.kind Input kind, e.g. batch, secret, confirm, choice or grid.
 * @param opts.title Short question shown as the card heading.
 * @param opts.message Optional Markdown explanation under the heading.
 * @param opts.spec Kind-specific settings, e.g. batch {items:[{key,kind,title,spec}]} for atomic collection, { options } for choice or { saveAs } for secret.
 * @param opts.agentId Agent to wake with the answer. @default the current agent
 * @param opts.waitForAnswer Persist a durable gate only when explicitly true. @default false
 * @param opts.expiresAt Optional future safe epoch-millisecond deadline; cannot extend a trusted kind deadline.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Input kind, e.g. batch, secret, confirm, choice or grid. */
    kind: string;
    /** Short question shown as the card heading. */
    title: string;
    /** Optional Markdown explanation under the heading. */
    message?: string;
    /** Kind-specific settings, e.g. batch {items:[{key,kind,title,spec}]} for atomic collection, { options } for choice or { saveAs } for secret. */
    spec?: Record<string, any>;
    /** Agent to wake with the answer. @default the current agent */
    agentId?: string;
    /** Wait durably for this input only when explicitly true. @default false */
    waitForAnswer?: boolean;
    /** Optional future safe epoch-millisecond deadline; cannot extend the kind's authoritative deadline. Worker expires open inputs without a browser. */
    expiresAt?: number;
}): Promise<{ id: string; kind: string; state: "open"; agentId: string }> {
    const kindName = String(opts.kind ?? "").trim().toLowerCase();
    const kind = (ctx.state as any).input?.kinds?.[kindName] as types.input.Registered | undefined;
    if (!kind) {
        const known = Object.keys((ctx.state as any).input?.kinds ?? {}).sort().join(", ");
        throw new Error(`input.request: unknown kind "${kindName}" — available: ${known || "none"}`);
    }
    const title = String(opts.title ?? "").trim();
    if (!title) throw new Error("input.request: title is required");
    const agentId = String(opts.agentId ?? (await ctx.fns.agent.current({})).id);
    if (kindName === 'batch' && Object.keys(opts.spec ?? {}).some(k => k !== 'items')) throw new Error('Invalid batch definition fields');
    const suppliedSpec = { ...(opts.spec ?? {}) };
    delete suppliedSpec._expiresAt;
    delete suppliedSpec._agentWait;
    delete suppliedSpec._choiceBatchId;
    const spec = { ...(kind.prepare ? await kind.prepare(ctx, { spec: suppliedSpec }) : suppliedSpec) };
    delete spec._expiresAt;
    delete spec._agentWait;
    delete spec._choiceBatchId;
    const wait = opts.waitForAnswer === true;
    const kindDeadline = kind.deadline ? await kind.deadline(ctx, { spec }) : undefined;
    // Reserved fields are framework-owned, even if a hook mutates its spec.
    delete spec._expiresAt;
    delete spec._agentWait;
    delete spec._choiceBatchId;
    const deadlineNow = Date.now();
    for (const [name, deadline] of [['expiresAt', opts.expiresAt], ['kind deadline', kindDeadline]] as const) {
        if (deadline !== undefined && (!Number.isSafeInteger(deadline) || deadline <= deadlineNow)) {
            throw new Error(`${name} must be a future epoch-millisecond integer`);
        }
    }
    const deadlines = [opts.expiresAt, kindDeadline].filter((value): value is number => value !== undefined);
    if (deadlines.length) spec._expiresAt = Math.min(...deadlines);
    if (wait) spec._agentWait = true;
    const id = "in" + Bun.randomUUIDv7().replace(/[^a-zA-Z0-9]/g, "").slice(-16);
    const now = Date.now();
    // Serialize membership changes with atomic choice batch submission.
    await ctx.fns.procs.db.transaction({ fn: async () => {
    await ctx.fns.procs.db.select({ sql: 'SELECT id FROM agents WHERE id=? FOR UPDATE', params: [agentId] });
    await ctx.fns.procs.db.run({
        sql: `INSERT INTO inputs (id, agent_id, kind, state, title, message, spec, created_at, updated_at)
              VALUES (?, ?, ?, 'open', ?, ?, ?::jsonb, ?, ?)`,
        params: [id, agentId, kindName, title, String(opts.message ?? ""), JSON.stringify(spec), now, now],
    });
    if (kindName === 'batch') await ctx.fns.procs.db.run({sql:'INSERT INTO input_batch_state(input_id) VALUES (?)',params:[id]});
    } });
    // messageIdx anchors the card in the transcript order: views that page or
    // fold by message (the compact "fresh tail") keep events that carry one.
    const lastIdx = Number((await ctx.fns.procs.db.select({ sql: "SELECT COALESCE(MAX(idx), -1) AS i FROM messages WHERE agent_id = ?", params: [agentId] }))[0]?.i ?? -1);
    const event: any = { type: "input", inputId: id, kind: kindName, title, ts: now, messageIdx: lastIdx + 1 };
    event.html = await ctx.fns.agent.renderEventHtml({ event, agentId });
    await ctx.fns.session.appendEvent({ id: agentId, event, ts: now });
    const live = (ctx.state as any).agent?.[agentId];
    if (live) await ctx.fns.session.syncAgentState({ agent: live });
    // Only new actionable inputs trigger push; delivery must never break form creation.
    await ctx.fns.webPush.notifyInput({ inputId: id }).catch(() => {
        console.warn("Web Push input notification unavailable");
    });
    return { id, kind: kindName, state: "open", agentId };
}
