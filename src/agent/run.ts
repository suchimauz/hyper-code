// The agent turn loop. Tools are invoked as the provider's NATIVE function
// calls. Malformed argument JSON rejects the entire response before any tool
// runs; valid argument objects then pass through ctx.fns.tools.validate.
//
// One loop, one registry: every call goes through ctx.fns.tools.call over the
// $tool_ declarations, exactly like a call made by hand from the REPL.
//
// The loop ends on a reply with no tool calls — pure prose back to the user.
/**
 * Execute one agent turn through native tool cycles and persist its final response.
 * Use for direct turns or worker-claimed input. Successful prose and terminal HTML
 * responses asynchronously launch optional Knowledge extraction through the final
 * durable assistant index; failed, aborted and observer turns do not launch it.
 * Refuses durably stopped agents, fences awaited work against Stop/replacement,
 * and passes an immutable runSignal to cooperative tools. Cannot preempt arbitrary JS.
 * @param opts.agent Live agent whose transcript and turn state are updated.
 * @param opts.userText User input to append unless already persisted by ingestion.
 * @param opts.userMessageAlreadyAppended Skip appending input for worker-claimed messages. @default false
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Live agent whose transcript and turn state are updated. */
        agent: types.agent.Agent;
        /** User input to append unless already persisted by ingestion. */
        userText: string;
        /** Skip appending input for worker-claimed messages. @default false */
        userMessageAlreadyAppended?: boolean;
    },
) {
    const { agent, userText } = opts;
    const agentCtx: any = Object.create(ctx);
    agentCtx.session = ctx.fns.session.forAgent({ agent });
    ctx = agentCtx;
    // Capture ownership before the first await; mutable currentJobId may belong
    // to a replacement by the time startup or a tool finishes.
    const runToken = agent.currentJobId ?? undefined;
    const ac = new AbortController();
    const assertRunActive = async () => {
        ac.signal.throwIfAborted();
        if (agent.abortController !== ac || (runToken && agent.currentJobId !== runToken)) {
            throw new DOMException('Run ownership lost', 'AbortError');
        }
        const rows = await ctx.fns.procs.db.select({
            sql: 'SELECT stopped_at, run_state, run_token FROM agents WHERE id = ?', params: [agent.id],
        }) as Array<{ stopped_at: number | null; run_state: string; run_token: string | null }>;
        ac.signal.throwIfAborted();
        if (agent.abortController !== ac || (runToken && agent.currentJobId !== runToken)
            || rows[0]?.stopped_at != null
            || (runToken && (rows[0]?.run_state !== 'running' || rows[0]?.run_token !== runToken))) {
            throw new DOMException('Run stopped or ownership lost', 'AbortError');
        }
    };
    // Downstream tools inherit the immutable run signal, not a replacement's controller.
    agentCtx.runSignal = ac.signal;
    let discardTransient: (() => void) | undefined;
    agent.abortController = ac;
    agent.activeRunCount = (agent.activeRunCount ?? 0) + 1;
    try {
    await assertRunActive();
    // One successful-turn hook shared by direct and worker runs. The cutoff is
    // the final durable assistant row, never the triggering user frontier or a
    // later MAX(idx) that could capture a concurrently arriving user message.
    const observeCompletedTurn = (messageIdx: number) => {
        if (ac.signal.aborted || agent.scratchpad?.knowledgeTrackingEnabled !== true
            || agent.scratchpad?.knowledgeSidecarFor || agent.scratchpad?.goalSidecarFor) return;
        const knowledge = (ctx.fns as any).knowledge;
        if (typeof knowledge?.updateSidecar !== 'function') return;
        // Do not hold the response/worker cursor open for extraction; absorb both
        // synchronous throws and rejected promises from the optional plugin.
        void Promise.resolve().then(() => knowledge.updateSidecar({ agent, messageIdx })).catch(() => undefined);
    };

    if (!opts.userMessageAlreadyAppended) {
        await ctx.fns.session.appendUserMessage({ id: agent.id, text: userText });
        await assertRunActive();
        await ctx.fns.session.syncAgentState({ agent });
        await assertRunActive();
    }

    agent.scratchpad ??= {};
    if (agent.scratchpad.plan?.pausedAt && userText.trim()) {
        const updated: any = await ctx.fns.session.mutateScratchpad({ id: agent.id, mutate: (scratchpad: Record<string, any>, now: number) => {
            const plan = scratchpad.plan;
            if (!plan?.pausedAt) return;
            plan.pausedAt = null;
            plan.updatedAt = now;
            const active = Array.isArray(plan.tasks) ? plan.tasks.find((task: any) => task.status === 'active') : null;
            if (active && !active.activeSince) active.activeSince = now;
        } });
        await assertRunActive();
        agent.scratchpad = updated.scratchpad;
        ctx.fns.events.refreshAgentMeta({ agentId: agent.id, section: 'plan', reason: 'plan-resumed' });
    }
    const activeStatusLine = await ctx.fns.agent.statusLineForTurn({ agent });
    await assertRunActive();
    agent.scratchpad.activeStatusLine = activeStatusLine;
    // The status line is persisted as a small cursor-excluded user row right
    // behind the message that started this run: the transcript then shows
    // exactly what the model saw, forks inherit it, and the provider prompt
    // cache keeps growing from the tail instead of being invalidated up front.
    // A retried run (provider error, cursor left in place) finds its own row
    // already at the tail and must not append a second copy.
    if (agent.scratchpad.activeStatusLine) {
        const tail = (agent.messages ?? [])[(agent.messages ?? []).length - 1];
        if (tail?.message_type !== 'status_line') {
            await ctx.fns.session.appendMessage({ id: agent.id, message: {
                role: 'user',
                content: `## Current status line\n\n${agent.scratchpad.activeStatusLine}`,
                excluded_from_cursor: true,
                message_type: 'status_line',
            } });
            await assertRunActive();
            await ctx.fns.session.syncAgentState({ agent });
            await assertRunActive();
        }
    }
    // Volatile model-visible context (bound tab, retrieved functions, plugin
    // blocks) is appended as its own cursor-excluded row, for the same reason as
    // the status line: it must not rewrite the cached bootstrap prefix. One call
    // per turn, before the first provider request. A turn still happens if it
    // fails: context the model would have liked is worth less than an answer.
    await ctx.fns.agent.syncWorldState?.({ agent })?.catch?.((error: any) => {
        ctx.fns.procs.log?.warn?.({ event: "agent.world-state.failed", msg: String(error?.message ?? error), agentId: agent.id });
        return null;
    });
    await assertRunActive();
    let consumedUserIdx = -1;
    const MAX_TURNS = 300;
    let turns = 0;
    // One unsuccessful compaction per run: a failing summarizer must not become
    // another expensive loop. Successful compactions may recur as context grows.
    let compactionBlocked = false;
    const compactAtBoundary = async () => {
        await assertRunActive();
        let compacted;
        try {
            compacted = await ctx.fns.agent.autoCompactIfNeeded({ agent, runToken, signal: ac.signal, checkOnly: compactionBlocked });
        } catch (error) {
            compactionBlocked = true;
            ctx.fns.procs.log?.warn?.({ event: 'agent.mid-turn-compaction.failed', msg: String(error), agentId: agent.id });
        }
        await assertRunActive();
        if (compacted && ['failed', 'stale', 'not_needed', 'no_compactor', 'busy'].includes(compacted.status)) compactionBlocked = true;
        ac.signal.throwIfAborted();
        // No retryable provider error: finish this run with a durable explanation,
        // preserving the cursor and every completed tool effect exactly once.
        if (compactionBlocked || compacted?.status === 'compacted' || compacted?.status === 'already_compact') {
            const budget = await ctx.fns.agent.autoCompactIfNeeded({ agent, runToken, signal: ac.signal, checkOnly: true });
            await assertRunActive();
            if (budget.contextWindow && budget.estimatedTokens >= budget.contextWindow * 0.9) {
                const text = 'Paused before another model request: context is near the model limit and compaction could not reduce it. Compact the context or start a new chat before continuing.';
                await ctx.fns.session.appendMessage({ id: agent.id, message: { role: 'assistant', content: text } });
                await assertRunActive();
                await ctx.fns.session.appendErrorEvent({ id: agent.id, error: text });
                await assertRunActive();
                if (runToken) await ctx.fns.agent.stopContextGuard({ agent, runToken });
                else await ctx.fns.agent.stop({ agent, clearQueue: true });
                return true;
            }
        }
        await assertRunActive();
        return false;
    };

    const MAX_MALFORMED_RESPONSES = 3;
    let consecutiveMalformedResponses = 0;
    let goalIterations = 0;
    let lastGoalFeedback = "";
    const goalDeadline = Date.now() + 5 * 60_000;
    const planAttempts: Record<string, number> = {};
    let totalPlanInjections = 0;
    while (true) {
        await assertRunActive();
        if (++turns > MAX_TURNS) {
            await ctx.fns.session.appendErrorEvent({ id: agent.id, error: `run hit the ${MAX_TURNS}-turn cap — closing; send a message to continue` });
            await assertRunActive();
            await ctx.fns.session.appendMessage({ id: agent.id, message: {
                role: 'user',
                content: `This run exceeded ${MAX_TURNS} tool cycles and was closed. Summarize where you are; the user can send a message to continue.`,
                excluded_from_cursor: true,
            } });
            await assertRunActive();
            await ctx.fns.session.syncAgentState({ agent });
            await assertRunActive();
        delete agent.scratchpad.activeStatusLine;

            return { text: '', usage: null, consumedUserIdx };
        }

        // Steering: read the frontier BEFORE refreshing the transcript, so a
        // message landing between the two gets INTO the call without being
        // counted consumed (a harmless duplicate pass beats a lost message).
        const seen = ((await ctx.fns.procs.db.select({
            sql: "SELECT COALESCE(MAX(idx), -1) AS i FROM messages WHERE agent_id = ? AND role = 'user' AND excluded_from_cursor = 0",
            params: [agent.id],
        })) as any[])[0];
        await assertRunActive();
        consumedUserIdx = Math.max(consumedUserIdx, Number(seen?.i ?? -1));
        await ctx.fns.session.syncAgentState({ agent });
        await assertRunActive();
        // Initial preflight is safe only when all persisted calls have results.
        if (turns === 1) {
            const answered = new Set(agent.messages.filter((m: any) => m.role === 'tool').map((m: any) => m.tool_call_id));
            const complete = agent.messages.every((m: any) => !m.tool_calls?.some((c: any) => !answered.has(c.id)));
            if (complete && await compactAtBoundary()) return { text: '', usage: null, consumedUserIdx };
        }

        // Keep the current prose in live memory for native clients. Persisting
        // every token would hammer Postgres; the final assistant event remains
        // the durable source of truth. A monotonically increasing revision lets
        // pollers replace one transient bubble without creating duplicates.
        await assertRunActive();
        const mobileStream = { text: "", revision: 0, startedAt: Date.now(), phase: 'streaming' };
        delete agent.scratchpad.streamHandoff;
        agent.scratchpad.mobileStream = mobileStream;
        await assertRunActive();
        const sampling = new AbortController();
        agent.samplingAbortController = sampling;
        // Stream notifications address only the RAM fragment, not DB-backed regions.
        let streamTimer: ReturnType<typeof setTimeout> | undefined;
        const notifyStream = () => ctx.fns.procs.events.emit({ topic: `agent:${agent.id}:stream`, event: { type: "refresh" } });
        const clearStream = (handoff = false) => {
            clearTimeout(streamTimer);
            streamTimer = undefined;
            // A late stream/finally must not erase a replacement run's state.
            if (agent.abortController !== ac || agent.scratchpad.mobileStream !== mobileStream) return;
            delete agent.scratchpad.mobileStream;
            if (handoff) agent.scratchpad.streamHandoff = true;
            else { delete agent.scratchpad.streamHandoff; notifyStream(); }
        };
        const abortStream = () => clearStream();
        discardTransient = abortStream;
        sampling.signal.addEventListener("abort", abortStream, { once: true });
        const onRunAbort = () => sampling.abort(ac.signal.reason ?? "run_aborted");
        ac.signal.addEventListener("abort", onRunAbort, { once: true });
        let streamed: any;
        try {
            const onEvent = (event: any) => {
                if (ac.signal.aborted || agent.abortController !== ac || sampling.signal.aborted || event?.type !== 'text_delta' || typeof event.delta !== 'string') return;
                mobileStream.text += event.delta;
                mobileStream.revision++;
                if (streamTimer === undefined) streamTimer = setTimeout(() => {
                    streamTimer = undefined;
                    if (!ac.signal.aborted && agent.abortController === ac) notifyStream();
                }, 350);
            };
            streamed = await ctx.fns.llm.stream({ agent, signal: sampling.signal, onEvent });
        } catch (error: any) {
            // Failed partial prose is never a durable assistant response.
            clearStream();
            if (sampling.signal.aborted && sampling.signal.reason === "new_user_input" && !ac.signal.aborted) {
                if (agent.samplingAbortController === sampling) agent.samplingAbortController = null;
                ac.signal.removeEventListener("abort", onRunAbort);
                // Nothing from the interrupted partial response is persisted.
                // The next loop refreshes the durable transcript and includes
                // every user message that arrived while sampling.
                continue;
            }
            throw error;
        } finally {
            if (agent.samplingAbortController === sampling) agent.samplingAbortController = null;
            ac.signal.removeEventListener("abort", onRunAbort);
            sampling.signal.removeEventListener("abort", abortStream);
        }
        await assertRunActive();
        // Keep visible text until the durable tail replaces it in one swap.
        clearTimeout(streamTimer);
        streamTimer = undefined;
        mobileStream.phase = 'finalizing';
        const { text, usage, finishReason, toolCalls = [] } = streamed;
        await ctx.fns.session.recordContextUsage({ id: agent.id, usage });
        await assertRunActive();
        const prose = String(text ?? '');
        delete agent.scratchpad.activeGoalFeedback;

        // Invalid JSON can arrive with any finish reason (including gateway
        // truncation without "length"). Reject the WHOLE batch before persisting
        // calls or executing tools, and bound retries locally to this run.
        if (toolCalls.some((c: any) => c?.args?.__unparsed !== undefined)) {
            clearStream();
            consecutiveMalformedResponses++;
            const knownLength = finishReason === 'length';
            if (consecutiveMalformedResponses >= MAX_MALFORMED_RESPONSES) {
                const error = `Stopped this turn after ${MAX_MALFORMED_RESPONSES} consecutive replies with malformed tool arguments. `
                    + 'No tools from those replies were executed. Retry with smaller tool payloads; '
                    + 'if this persists, check the model gateway or switch models.';
                await ctx.fns.session.appendErrorEvent({ id: agent.id, error });
                await assertRunActive();
                await ctx.fns.session.appendMessage({ id: agent.id, message: { role: 'assistant', content: error } });
                await assertRunActive();
                await ctx.fns.session.syncAgentState({ agent });
                await assertRunActive();
                delete agent.scratchpad.activeStatusLine;
                return { text: error, usage, consumedUserIdx };
            }
            await ctx.fns.session.appendErrorEvent({ id: agent.id, error: knownLength
                ? 'reply truncated at token limit — tool calls not executed'
                : 'reply contained malformed tool arguments — tool calls not executed' });
            await assertRunActive();
            await ctx.fns.session.appendMessage({ id: agent.id, message: {
                role: 'user',
                content: (knownLength
                    ? 'Your reply hit the token limit and was cut off mid-call, so NOTHING was executed. '
                    : 'Your reply contained malformed tool argument JSON, so NOTHING in the batch was executed. The cause is unknown. ')
                    + 'Re-issue the call with valid JSON and a smaller payload. '
                    + 'Use small targeted edits rather than rewriting a large file; do not repeat the same oversized call.',
                excluded_from_cursor: true,
            } });
            await assertRunActive();
            await ctx.fns.session.syncAgentState({ agent });
            await assertRunActive();
            continue;
        }

        consecutiveMalformedResponses = 0;

        // The assistant turn is ONE row, carrying both what it said and what it
        // called — that pairing is what the next request replays.
        if (!prose.trim() && toolCalls.length === 0) {
            clearStream();
            return { text: prose, usage, consumedUserIdx };
        }

        const append = await ctx.fns.session.appendMessage({ id: agent.id, message: {
            role: 'assistant',
            content: prose,
            tool_calls: toolCalls.length ? toolCalls : undefined,
        } });
        await assertRunActive();
        await ctx.fns.session.syncAgentState({ agent });
        await assertRunActive();

        if (prose.trim()) {
            const html = await ctx.fns.markdown.render({ source: prose, fileBaseDir: agent.workspaceDir || process.cwd() });
            await assertRunActive();
            const activeStatus = String(agent.scratchpad?.activeStatusLine ?? "");
            const instructionIndicators = {
                statusLine: activeStatus.split("\n").find((line: string) => line.startsWith("User status line: "))?.slice("User status line: ".length) || null,
            };
            // The durable tail now owns replacement; do not broadcast an empty
            // transient fragment between the streamed and persisted messages.
            clearStream(true);
            await ctx.fns.session.appendAssistantEvent({ id: agent.id, payload: {
                text: prose, html, usage, messageIdx: append.idx, instructionIndicators,
            } });
            await assertRunActive();
            await ctx.fns.session.syncAgentState({ agent });
            await assertRunActive();
        }
        clearStream(!!prose.trim());
        discardTransient = undefined;

            const goal = agent.goal;
        if (toolCalls.length === 0) {
            if (goal?.enabled && goal?.statement) {
                const check = await ctx.fns.agent.checkGoal({ agent, candidateAnswer: prose });
                await assertRunActive();
                const feedback = `${check.reason}\n${check.nextStep ?? ""}`.trim();
                const maxIterations = Math.max(1, Math.min(10, Number(goal.maxIterations ?? 3)));
                const withinBudget = goalIterations < maxIterations;
                const withinTime = Date.now() < goalDeadline;
                const hasProgress = feedback !== lastGoalFeedback;
                const canContinue = check.status === "continue" && withinBudget && withinTime && hasProgress;
                const effectiveCheck = check.status === "continue" && !canContinue ? {
                    status: "limit_reached",
                    reason: !withinBudget
                        ? `Goal continuation limit (${maxIterations}) reached. Last check: ${check.reason}`
                        : !withinTime
                        ? `Goal continuation deadline reached. Last check: ${check.reason}`
                        : `Goal checker repeated the same feedback. Last check: ${check.reason}`,
                    nextStep: check.nextStep,
                    evidence: check.evidence,
                } : check;
                await ctx.fns.agent.recordGoalCheck({ agent, check: effectiveCheck });
                await assertRunActive();

                const displayIteration = canContinue ? goalIterations + 1 : Math.min(goalIterations, maxIterations);
                const label = effectiveCheck.status === "achieved"
                    ? `Goal achieved: ${effectiveCheck.reason}`
                    : effectiveCheck.status === "limit_reached"
                    ? `Goal check limit reached: ${effectiveCheck.reason}`
                    : `Goal check: ${effectiveCheck.status}. ${effectiveCheck.reason}${effectiveCheck.nextStep ? `\nNext: ${effectiveCheck.nextStep}` : ""}`;
                const feedbackRow = await ctx.fns.session.appendMessage({ id: agent.id, message: {
                    role: "user",
                    content: label,
                    message_type: "goal_feedback",
                    excluded_from_cursor: true,
                } });
                await assertRunActive();
                await ctx.fns.session.appendEvent({ id: agent.id, event: {
                    type: "goal_check",
                    status: effectiveCheck.status,
                    reason: effectiveCheck.reason,
                    nextStep: effectiveCheck.nextStep ?? null,
                    iteration: displayIteration,
                    maxIterations,
                    messageIdx: feedbackRow.idx,
                } });
                await assertRunActive();
                await ctx.fns.session.syncAgentState({ agent });
                await assertRunActive();

                if (canContinue) {
                    goalIterations++;
                    lastGoalFeedback = feedback;
                    continue;
                }
            }

            const plan = agent.scratchpad?.plan;
            const activeTask = Array.isArray(plan?.tasks) ? plan.tasks.find((task: any) => task.status === "active") : null;
            const attempts = activeTask ? Number(planAttempts[activeTask.id] ?? 0) : 0;
            if (activeTask && !plan.pausedAt && attempts < 2 && totalPlanInjections < 5) {
                planAttempts[activeTask.id] = attempts + 1;
                totalPlanInjections++;
                const feedback = [
                    `Continue the active plan task.`,
                    `Task ID: ${activeTask.id}`,
                    `Title: ${activeTask.title}`,
                    activeTask.instructions ? `Instructions:\n${activeTask.instructions}` : "",
                    `Call session.done({ agent, id: ${JSON.stringify(activeTask.id)} }) only after the task is complete.`,
                ].filter(Boolean).join("\n\n");
                await ctx.fns.session.appendMessage({ id: agent.id, message: {
                    role: "user",
                    content: feedback,
                    message_type: "plan_feedback",
                    excluded_from_cursor: true,
                } });
                await assertRunActive();
                await ctx.fns.session.syncAgentState({ agent });
                await assertRunActive();
                continue;
            }


            delete agent.scratchpad.activeStatusLine;
            observeCompletedTurn(append.idx);
            return { text: prose, usage, consumedUserIdx };
        }

        // Every answer row is written NOW, empty, right after the call it
        // belongs to — before a single tool runs. A call with no result is a
        // transcript every provider rejects, and a run can die mid-flight (a
        // restart, a kill, a sleeping machine); with the row already in place
        // the worst case is an honest "interrupted", not an agent that can
        // never speak again because its own history is malformed.
        const pending: Record<string, number> = {};
        for (const call of toolCalls) {
            await assertRunActive();
            const row = await ctx.fns.session.appendMessage({ id: agent.id, message: {
                role: 'tool',
                content: `(${call.name} is running — interrupted before it reported back)`,
                tool_call_id: call.id,
                excluded_from_cursor: true,
            } });
            await assertRunActive();
            pending[call.id] = row.idx;
        }
        await ctx.fns.session.syncAgentState({ agent });
        await assertRunActive();

        // Calls in one reply are independent by construction — no protocol lets
        // a later call read an earlier one's result — so a failure does not
        // invalidate its neighbours. Each is executed and its row filled in.
        // A terminal payload is only acted on AFTER every tool-result row is
        // filled, preserving the provider's native tool-call transcript.
        let terminal: { type: 'html'; html: string; text: string } | undefined;
        for (const call of toolCalls) {
            await assertRunActive();
            const r = await ctx.fns.tools.call({ name: call.name, args: call.args, agent });
            await assertRunActive();
            const { content: output, result_ref } = await ctx.fns.agent.stashResult({ agent, output: r.output, kind: call.name });
            await assertRunActive();

            // Events store data, never rendered markup. renderEventHtml builds
            // the current view on every read, so renderer improvements apply to
            // old calls too (including edit diff cards).
            await ctx.fns.session.appendToolCallEvent({ id: agent.id, payload: {
                name: call.name, args: call.args, result: output, result_ref,
                isError: r.isError,
                messageIdx: append.idx,
            } });
            await assertRunActive();
            await ctx.fns.session.updateMessageContent({
                id: agent.id,
                idx: pending[call.id]!,
                content: r.content?.length ? [{ type: 'text', text: output }, ...r.content] : output,
                result_ref,
            });
            await assertRunActive();
            if (!r.isError && r.terminal?.type === 'html') terminal = r.terminal;
        }
        await ctx.fns.session.syncAgentState({ agent });
        await assertRunActive();

        if (terminal) {
            await assertRunActive();
            const text = terminal.text.trim() || 'HTML response';
            const html = ctx.fns.agent.sanitizeHtmlBody({ html: terminal.html });
            const final = await ctx.fns.session.appendMessage({ id: agent.id, message: {
                role: 'assistant',
                content: text,
            } });
            await assertRunActive();
            const activeStatus = String(agent.scratchpad?.activeStatusLine ?? '');
            const instructionIndicators = {
                statusLine: activeStatus.split('\n').find((line: string) => line.startsWith('User status line: '))?.slice('User status line: '.length) || null,
            };
            await ctx.fns.session.appendAssistantEvent({ id: agent.id, payload: {
                text, html, usage, messageIdx: final.idx, instructionIndicators,
            } });
            await assertRunActive();
            await ctx.fns.session.syncAgentState({ agent });
            await assertRunActive();
            delete agent.scratchpad.activeStatusLine;
            observeCompletedTurn(final.idx);
            return { text, html, usage, consumedUserIdx, terminal: true };
        }
        // Every side effect and tool-result replacement is durable now. Never
        // restart the turn or replay a tool batch to reclaim model context.
        if (await compactAtBoundary()) return { text: '', usage: null, consumedUserIdx };
    }
    } finally {
        discardTransient?.();
        agent.activeRunCount = Math.max(0, (agent.activeRunCount ?? 1) - 1);
        if (agent.abortController === ac) agent.abortController = null;
    }
}
