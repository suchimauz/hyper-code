// Build the system + messages payload for an LLM call.
//
// Policy (option A — "system-as-messages"): the full instruction body lives
// as a synthetic user → assistant exchange at the start of the conversation;
// system is empty or near-empty. Rationale: models attend to recent user
// messages more reliably than to system, especially smaller / local models
// (Haiku, Llama). Moving instructions into the conversation also makes them
// visible in transcript debugging.
//
// Anthropic OAuth subscription (claude-code provider) is a special case:
// the server-side anti-fraud check rejects requests whose system prompt
// doesn't start with the Claude Code identity line. That line MUST stay in
// `system` regardless of policy. Everything else moves to messages.
//
// Returns:
//   { system: string, messages: Message[] }  — both ready to feed to a
//   streamer. messages is [bootstrap-user, bootstrap-ack, ...transcript].
/**
 * Assemble the outgoing system prompt and effective transcript, including checkpoint fallback metadata.
 * Use preview for a read-only context estimate: it may reuse existing Jev decisions but never requests new scores.
 * Refreshes authoritative goal context outside bootstrap on every request. A run-owned
 * derived context can suppress only that agent's queued continuation rows; inherited
 * indices remain untouched and compact summaries are bypassed while suppression applies.
 * @param opts.agent Agent whose prompt and transcript are assembled.
 * @param opts.preview Avoid external relevance scoring and repair logs for UI previews. @default false
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Live agent instance to operate on. */
    agent: types.agent.Agent;
        /** Read-only preview; reuse cached relevance choices without external calls or repair logs. @default false */
    preview?: boolean },
): Promise<{ system: string; messages: any[]; /** Number of leading synthetic instruction/ack messages, independent of wire role; excludes human transcript. */ bootstrapMessageCount: number; /** Exclusive canonical-message boundary before per-request control instructions. */ cacheableMessageCount: number; context: { mode: "full" | "compact"; fallback: "missing_generation" | "missing_checkpoint" | "incompatible_checkpoint" | "invalid_boundary" | null; revision: number | null } }> {
    const { agent } = opts;
    const fullPrompt = await ctx.fns.agent.fullSystemPrompt({ agent });
    // Fresh authoritative state on every request, never cached in bootstrap or agent.goal.
    const goalState = await ctx.fns.goal.read({ agentId: agent.id });
    const scopedCtx = ctx as Context & { goalContextDelivered?: boolean };
    const capability = goalState.enabled && !opts.preview && typeof ctx.fns.goal.nativeCapability === 'function'
        ? await ctx.fns.goal.nativeCapability({ agentId: agent.id }).catch(() => ({ available: false })) : { available: false };
    // Like Codex goal steering: render once per run (turn) and keep that exact text at the
    // position where it was first delivered. Re-rendering per request (tokens used, revision)
    // and re-appending it after every tool result made the model treat each step as a fresh
    // "inspect current state" instruction and re-run its reconnaissance.
    const runScoped = !opts.preview && Object.hasOwn(ctx, 'goalRequestContext');
    const turnCtx = ctx as Context & { goalTurnContext?: { key: string; text: string; at: number | null } };
    const g = goalState.enabled ? goalState.goal : null;
    const goalKey = JSON.stringify([goalState.enabled, g?.goalId ?? null, g?.status ?? null, g?.objective ?? null, g?.tokenBudget ?? null, capability.available]);
    const frozen = runScoped && turnCtx.goalTurnContext?.key === goalKey ? turnCtx.goalTurnContext : null;
    const goalContext = frozen ? frozen.text : goalState.enabled || scopedCtx.goalContextDelivered
        ? await ctx.fns.goal.promptContext({ snapshot: goalState.enabled ? goalState.goal : null, enabled: goalState.enabled, modelToolAvailable: capability.available })
        : '';
    if (goalContext && !opts.preview && Object.hasOwn(ctx, 'goalRequestContext')) scopedCtx.goalContextDelivered = true;
    const requestScope = (ctx as Context & { goalRequestContext?: { agentId: string; omitGoalContinuationIdxs: readonly number[]; authority?: types.goal.DelegationAuthority } }).goalRequestContext;
    const omitted = new Set(requestScope?.agentId === agent.id ? requestScope.omitGoalContinuationIdxs : []);
    const authority = requestScope?.agentId === agent.id ? requestScope.authority : undefined;
    if (authority && (!Number.isSafeInteger(authority.authorizedThroughIdx) || authority.authorizedThroughIdx! < 0)) {
        throw new Error('Delegated request missing authorized task frontier');
    }
    let fullHistory = agent.parentId
        ? await ctx.fns.session.getFullMessages({ id: agent.id })
        : (agent.messages ?? []);
    if (omitted.size || authority) {
        // Indices are local, not globally unique. Read the fork boundary and own
        // rows explicitly; getFullMessages deliberately drops origin metadata.
        const rows = await ctx.fns.procs.db.select({ sql: 'SELECT parent_id, fork_offset FROM agents WHERE id = ?', params: [agent.id] });
        const own = await ctx.fns.session.getMessages({ id: agent.id });
        const parent = rows[0]?.parent_id
            ? await ctx.fns.session.getFullMessages({ id: rows[0].parent_id }) : [];
        const inherited = rows[0]?.fork_offset == null ? parent : parent.slice(0, Number(rows[0].fork_offset));
        fullHistory = [...inherited, ...own.filter(message => !(message.message_type === 'goal_continuation' && omitted.has(Number(message.idx)))
            && !(authority && message.role === 'user'
                && (!Number.isSafeInteger(Number(message.idx)) || Number(message.idx) > authority.authorizedThroughIdx!)))];
    }
    // A checkpoint may already summarize the omitted row. Fail closed to full
    // history rather than leaking its instructions through a compact summary.
    const projection = await ctx.fns.compaction.project({ model: agent.model, messages: fullHistory, sleepContext: omitted.size || authority ? null : agent.sleepContext });
    const raw = projection.messages;

    // A call with no result is a transcript every provider refuses, and a run
    // that dies between the two writes leaves one behind. Repairing here — on
    // the way OUT, for whichever dialect — means such an agent answers again
    // instead of 400-ing forever on history it cannot edit.
    const { messages: repairedBase, repaired } = ctx.fns.session.repairToolPairs({ messages: raw });
    // Opt-in, outgoing-only selection: stored transcript and tool pairs stay intact.
    // Relevance failures must never prevent the main model from receiving history.
    const base = await ctx.fns.agent.selectJevContext({ agent, messages: repairedBase, cachedOnly: opts.preview }).catch(() => repairedBase);
    // The retrieved function catalogue USED to be spliced into the last user
    // message from here, and was never persisted: the transcript disagreed with
    // what the model saw, and a catalogue that changed between requests
    // invalidated the prompt cache from that message onwards. It is a
    // `world_state` transcript row now — see agent.syncWorldState, called once
    // per turn by agent.run. This function only reads history; it no longer
    // rewrites it.
    if (repaired.length && !opts.preview) {
        ctx.fns.procs.log.warn({
            event: "transcript.repair",
            msg: `${agent.id}: closed ${repaired.length} unanswered tool call(s)`,
            calls: repaired.map(r => `${r.name}#${r.id}`),
        });
    }

    // Plugin blocks for this turn (`agent.promptAugment`) used to be spliced
    // into the last user message from here. They are collected by
    // agent.syncWorldState now and travel as a persisted tail row, for the same
    // reason as the function catalogue: a block that changes between requests
    // must not rewrite history the provider has already cached.
    const ep = await ctx.fns.llm.resolveEndpoint({ model: agent.model });
    const claudeCodeHeader = "You are Claude Code, Anthropic's official CLI for Claude.";

    // Nothing per-turn lives in the bootstrap: every byte there is the cached
    // prefix shared by all later requests and by transcript-sharing forks.
    // The status line is a persisted transcript row (see agent.run).
    let system = '';
    let bodyText = fullPrompt;
    const upstream = ep.provider === 'hyper' ? (ep.upstream ?? '') : ep.provider;
    if (upstream === 'claude-code' || upstream === 'anthropic-oauth') {
        system = claudeCodeHeader;
        if (bodyText.startsWith(claudeCodeHeader)) {
            bodyText = bodyText.slice(claudeCodeHeader.length).trimStart();
        }
    }

    const bootstrap = bodyText
        ? [
            { role: 'user' as const, content: bodyText },
            { role: 'assistant' as const, content: 'Understood. Ready to act.' },
        ]
        : [];

    // Several people may write into one chat: tell the model who said what. A copy for this
    // request only; with a single user nothing changes and the cached prefix stays identical.
    const attributed = await ctx.fns.auth.attributeMessages({ messages: base });
    if (attributed.applied && bootstrap.length) {
        bootstrap[0] = { role: 'user' as const, content: bootstrap[0]!.content + '\n\nSeveral people use this chat. Each human message starts with `<Name>:` — the person who wrote it. Answer that person; your own replies have no such prefix.' };
    }

    // Durable attachment refs stay tiny in Postgres and are materialized only
    // for this provider request. This keeps forks, BM25 and compaction free of
    // base64 while retaining native image/PDF input where supported.
    const messages = await ctx.fns.attachments.resolveContent({ messages: [...bootstrap, ...attributed.messages] });

    if ((ctx as Context & { goalCompletionReport?: boolean }).goalCompletionReport) {
        messages.push({ role: 'user', content: 'The goal is successfully complete. Give the final user-facing report now, using only existing results. Do not perform more work, call tools, or propose autonomous continuation. Include final token usage when a token budget was requested.' });
    }

    // Check for large tool call arguments before sending to LLM.
    // If a write/edit call has content > 100 KB, block it and instruct model.
    const LARGE_CONTENT_THRESHOLD = 100_000; // bytes
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'assistant' && lastMsg?.tool_calls?.length) {
        for (const call of lastMsg.tool_calls) {
            const contentArg = call.args?.content;
            if (typeof contentArg === 'string' && contentArg.length > LARGE_CONTENT_THRESHOLD) {
                // Remove the oversized calls from this message
                lastMsg.tool_calls = lastMsg.tool_calls.filter((c: any) => !(typeof c.args?.content === 'string' && c.args.content.length > LARGE_CONTENT_THRESHOLD));
                // Inject a guidance message instead
                const sizeKb = Math.round(contentArg.length / 1024);
                messages.push({
                    role: 'user' as const,
                    content: `⚠️ Large payload detected (${sizeKb} KB). To avoid token limit truncation, use one of these strategies:\n` +
                        `1. Generate content with eval, then write: const big = await ctx.fns.tools.eval({code: "..."}); await ctx.fns.files.write({path, content: big})\n` +
                        `2. Split into multiple smaller write/edit calls\n` +
                        `3. Use bash to create the file directly\n\n` +
                        `Reconsider your approach and try again.`,
                    excluded_from_cursor: true,
                });
                break;
            }
        }
    }

    // Only the durable prefix can be reused by the next request. Synthetic
    // continuation, goal and planning instructions remain outside this boundary.
    // A run-frozen goal context sits where it was first delivered, inside the stable prefix,
    // so later requests of the same run extend the cached prefix instead of rewriting its tail.
    let goalPlaced = false;
    if (goalContext && frozen && frozen.at !== null && frozen.at <= messages.length) {
        messages.splice(frozen.at, 0, { role: 'user', content: goalContext, excluded_from_cursor: true });
        goalPlaced = true;
    }
    const cacheableMessageCount = messages.length;

    // A transcript that ENDS with an assistant message is a "prefill" request:
    // the model is asked to continue its own half-written turn. It happens
    // normally here — a run answers a mid-run user message with a terminal
    // respondHtml, the worker reschedules for that same message, and the next
    // request replays a history whose last row is that final answer.
    //
    // Most models continue happily; some (claude-opus-5) reject the request
    // outright with 400 "does not support assistant message prefill", which
    // kills the run, leaves the cursor unadvanced and repeats forever. So the
    // request always ends on a user turn — a one-line nudge, never persisted.
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant' && !(last.tool_calls?.length)) {
        messages.push({
            role: 'user',
            content: 'Continue from where you stopped: if the previous answer already settled the user\'s request, say so briefly; otherwise take the next step.',
        });
    }

    if (goalContext && !goalPlaced) {
        if (runScoped) turnCtx.goalTurnContext = { key: goalKey, text: goalContext, at: messages.length };
        messages.push({ role: 'user', content: goalContext, excluded_from_cursor: true });
    }
    // Fresh control-plane mode always follows historical/compacted instructions.
    const planningContext = await ctx.fns.planning.prompt({ agentId: agent.id });
    messages.push({ role: 'user', content: planningContext, excluded_from_cursor: true });

    return {
        system,
        messages,
        bootstrapMessageCount: bootstrap.length,
        cacheableMessageCount,
        context: { mode: projection.mode, fallback: projection.fallback, revision: projection.revision },
    };
}

