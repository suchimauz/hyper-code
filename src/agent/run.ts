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
 * Retries classified model failures with the durable configurable common policy, before
 * persisting or executing partial responses. Persists observed event-index run boundaries and
 * final answer identity for grouping without guessing historical execution boundaries.
 * Refreshes the durable transcript and honors Stop,
 * replacement and new input; provider auth/quota failures are not inference retries.
 * @param opts.agent Live agent whose transcript and turn state are updated.
 * @param opts.userText User input to append unless already persisted by ingestion.
 * @param opts.userMessageAlreadyAppended Skip appending input for worker-claimed messages. @default false
 * @param opts.omitGoalContinuationIdxs Own-agent queued goal continuation indices omitted only from this run's outgoing requests.
 * @param opts.goalAuthority Trusted immutable worker-consumed descendant capability; never accepted from model input.
 * @param opts.onGoalFinalCheckpoint Trusted worker callback for the exact final committed receipt with drained provider requests, including failed turns.
 * @param opts.onGoalBinding Trusted synchronous worker hook, called once before first provider execution with the captured root-local identity; never serialized or exposed to model tools.
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
        /** Own-agent queued goal continuation indices omitted only from outgoing requests; durable history is unchanged. */
        omitGoalContinuationIdxs?: number[];
        /** Trusted worker-consumed descendant capability; a non-bound capture forbids execution. */
        goalAuthority?: types.goal.DelegationAuthority;
        /** Internal synchronous worker hook for immutable root-local identity at first provider execution; not model input. */
        /** Trusted synchronous final receipt hook; absent for pending or blocked accounting. */
        onGoalFinalCheckpoint?: (proof: Readonly<{ sourceAgentId: string; sourceRunToken: string; goalId: string; capabilityId?: string; checkpointId: string; sequence: number; drained: true }>) => void;
        onGoalBinding?: (binding: Readonly<{ goalId: string; runToken: string }>) => void;
    },
) {
    const { agent, userText } = opts;
    const inputWaitSince = Date.now();
    const agentCtx: any = Object.create(ctx);
    agentCtx.session = ctx.fns.session.forAgent({ agent });
    // Derived context flows through provider adapters without sharing mutable agent state.
    // Always replace any inherited scope: a nested run must never inherit its parent's filter.
    agentCtx.goalRequestContext = Object.freeze({
        agentId: agent.id,
        authority: opts.goalAuthority ? Object.freeze({ ...opts.goalAuthority }) : undefined,
        omitGoalContinuationIdxs: Object.freeze([...(opts.omitGoalContinuationIdxs ?? [])]),
    });
    ctx = agentCtx;
    // Capture ownership before the first await; mutable currentJobId may belong
    // to a replacement by the time startup or a tool finishes.
    const runToken = agent.currentJobId ?? undefined;
    const goalAuthority = opts.goalAuthority ? Object.freeze({ ...opts.goalAuthority }) : undefined;
    const goalRole = agent.scratchpad?.goalSidecarFor ? 'goal-sidecar' : agent.scratchpad?.knowledgeSidecarFor ? 'knowledge-sidecar' : 'normal';
    // parentId is transcript lineage, not delegation authority: manual forks own
    // their local Goal. Capability-bound descendants and sidecars never gain root tools.
    const toolRole = goalRole !== 'normal' ? 'sidecar' : goalAuthority ? 'descendant' : 'root';
    // Native authority is supplied only by dispatchTool, never inherited from context.
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
    const lifecycleId = crypto.randomUUID();
    let lifecycleStarted = false;
    let goalRun: types.goal.RunState | undefined;
    let goalOwnerLease: Readonly<{agentId:string;runToken:string|null}> | null = null;
    // Shared reference: finally may grant permission only after the last checkpoint commits.
    const goalReturn: { goalContinuation?: { goalId: string; revision: number; allowContinuation: true } } = {};
    let goalResult: types.goal.RunResult | undefined;
    let goalCompleted = false;
    let goalBindingReported = false;
    let nativeMutationStopped = false;
    // One prose-only receipt after our own successful completion, never task continuation.
    let completionReport = false;
    let nativeHandoffFailed = false;
    let lifecycleStatus: 'completed' | 'stopped' | 'error' = 'completed';
    let finalAnswerIdx: number | null = null;
    let candidateAnswerIdx: number | null = null;
    let discardTransient: (() => void) | undefined;
    agent.abortController = ac;
    agent.activeRunCount = (agent.activeRunCount ?? 0) + 1;
    try {
    await assertRunActive();
    // Compatibility for workers loaded before the dynamic startup validator.
    // A prior startup promotion leaves an unconsumed user row, so acceptance
    // rejects a second item under the agent lock for this same claim.
    if (runToken && opts.userMessageAlreadyAppended && !goalAuthority) {
        await ctx.fns.agent.promoteQueuedTurn({agentId:agent.id,runToken});
        await assertRunActive();
    }
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

    await ctx.fns.agent.recordRunLifecycle({ agentId: agent.id, runId: lifecycleId, status: 'open' });
    lifecycleStarted = true;
    await assertRunActive();
    let goalBinding: types.goal.RunResult;
    try {
        goalBinding = await ctx.fns.goal.runBindingCapture({
            sourceAgentId: agent.id, runId: lifecycleId, runToken: runToken ?? '', authority: goalAuthority,
            role: goalRole,
        });
    } catch (error) {
        if (goalAuthority) return { goalAdmissionBlocked: true };
        throw error;
    }
    // Capture errors must never downgrade root work to unaccounted sampling.
    // Confirmed inactive goals may chat; required descendants cannot, including
    // gate-off/excluded-role races after consume. Leave their cursor untouched.
    if ((goalAuthority && goalBinding.kind !== 'bound') || goalBinding.kind === 'blocked') return { goalAdmissionBlocked: true };
    // Only an explicitly disabled feature or a confirmed absent Goal may use
    // legacy automation. Inactive/read-failed/excluded bindings are authoritative.
    let legacyAutomation = goalBinding.kind === 'disabled' || goalBinding.kind === 'absent';
    // Initial observation is immutable until our own accounting commit or successful mutation.
    const initialNativeRead = goalBinding.kind !== 'disabled' && runToken && toolRole === 'root'
        ? await ctx.fns.goal.read({ agentId: agent.id }) : { enabled: false as const };
    let nativeSnapshot = initialNativeRead.enabled ? initialNativeRead.goal : null;
    nativeHandoffFailed = !!((goalBinding.kind === 'bound' && toolRole === 'root' && runToken
            && (!nativeSnapshot || nativeSnapshot.goalId !== goalBinding.state.binding.goalId))
        || (goalBinding.kind === 'absent' && nativeSnapshot)
        || (goalBinding.kind === 'inactive' && (!nativeSnapshot || nativeSnapshot.goalId !== goalBinding.goalId || nativeSnapshot.status === 'active')));
    const nativeBinding = () => runToken && toolRole === 'root' && goalBinding.kind !== 'disabled' ? Object.freeze({
        sourceAgentId: agent.id, ownerAgentId: agent.id, runToken, role: toolRole,
        expectedGoalId: nativeSnapshot?.goalId ?? null,
        expectedRevision: nativeSnapshot?.revision ?? null,
        // No host-cap setting exists: null is the explicit trusted unlimited default.
        maxTokenBudget: null,
    }) : undefined;
    const refreshNativeRevision = () => {
        if (nativeSnapshot && goalRun && goalResult?.kind === 'committed'
            && nativeSnapshot.goalId === goalRun.binding.goalId && goalResult.revision >= nativeSnapshot.revision) {
            nativeSnapshot = { ...nativeSnapshot, revision: goalResult.revision, status: goalResult.status };
        }
    };
    const onNativeMutation = async (snapshot: types.goal.State | null) => {
        nativeHandoffFailed = true;
        await assertRunActive();
        if (!snapshot || !runToken || toolRole !== 'root') throw new Error('Native Goal mutation lost run authority');
        const replacing = snapshot.goalId !== nativeSnapshot?.goalId;
        if (replacing) {
            if (nativeSnapshot && nativeSnapshot.status !== 'complete') throw new Error('Unexpected Goal identity replacement');
            if (goalRun && (goalRun.pendingRequests.size || goalRun.blocked)) throw new Error('Goal replacement requires drained accounting');
            const next = await ctx.fns.goal.runBindingCapture({ sourceAgentId: agent.id, runId: lifecycleId, runToken, role: goalRole });
            await assertRunActive();
            if (next.kind !== 'bound' || next.state.binding.goalId !== snapshot.goalId || next.state.revision !== snapshot.revision) throw new Error('Native Goal accounting handoff failed');
            if (goalRun) await ctx.fns.goal.runStopRegistry({ action: 'remove', agentId: agent.id, runToken, state: goalRun });
            goalRun = next.state;
            goalBinding = next;
            goalBindingReported = false;
            legacyAutomation = false;
            await ctx.fns.goal.runStopRegistry({ action: 'register', agentId: agent.id, runToken, state: goalRun });
            // Fresh accumulator begins AFTER activation; preceding response is never billed twice.
            goalResult = await ctx.fns.goal.runCheckpointFlush({ state: goalRun });
            if (goalResult.kind !== 'committed') throw new Error('Native Goal initial accounting failed');
        } else if (goalRun) {
            goalRun.revision = snapshot.revision;
            // The mutation is already committed. Close the batch immediately,
            // independently of the following accounting flush or handler envelope.
            if (goalResult?.kind === 'committed') goalResult = {
                ...goalResult, revision: snapshot.revision, status: snapshot.status,
                allowContinuation: snapshot.status === 'active',
            };
        }
        nativeMutationStopped = snapshot.status !== 'active';
        nativeSnapshot = { ...snapshot };
        refreshNativeRevision();
        nativeHandoffFailed = false;
    };
    const goalBoundarySummary = 'Further automatic work stopped: Goal accounting or its budget cannot authorize more work. No additional tools were executed after this boundary.';
    if (goalBinding.kind === 'bound') {
        goalRun = goalBinding.state;
        // A freshly captured binding establishes an empty request baseline before
        // any sampling; forkRelease additionally validates the durable live lease.
        if (!goalRun.binding.authority) await ctx.fns.goal.forkRelease({ agentId: agent.id, goalId: goalRun.binding.goalId, runToken: goalRun.binding.runToken, baselineAvailable: goalRun.pendingRequests.size === 0 && !goalRun.sealed });
        await assertRunActive();
        await ctx.fns.goal.runStopRegistry({ action: 'register', agentId: agent.id, runToken: goalRun.binding.runToken, state: goalRun });
    }
    await assertRunActive();

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
    // Goal context, Codex-style: a persisted row appended only when the goal changes,
    // never re-rendered per request, so the cached prefix keeps growing from the tail.
    await ctx.fns.agent.syncGoalContext?.({ agent })?.catch?.((error: any) => {
        ctx.fns.procs.log?.warn?.({ event: "agent.goal-context.failed", msg: String(error?.message ?? error), agentId: agent.id });
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
        if (opts.omitGoalContinuationIdxs?.length || compactionBlocked || compacted?.status === 'compacted' || compacted?.status === 'already_compact') {
            const budget = opts.omitGoalContinuationIdxs?.length
                ? await ctx.fns.agent.contextBudget({ agentId: agent.id })
                : await ctx.fns.agent.autoCompactIfNeeded({ agent, runToken, signal: ac.signal, checkOnly: true });
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
    // Shared across all model/tool cycles in this run; successful cycles do not reset it.
    let goalIterations = 0;
    let lastGoalFeedback = "";
    const goalDeadline = Date.now() + 5 * 60_000;
    const planAttempts: Record<string, number> = {};
    let totalPlanInjections = 0;
    while (true) {
        if (await ctx.fns.input.isWaiting({ agentId: agent.id, since: inputWaitSince })) {
            return Object.assign(goalReturn, { text: '', usage: null, consumedUserIdx, inputWaiting: true });
        }
        if (nativeHandoffFailed) throw new Error('Native Goal accounting handoff failed; explicit retry required');
        if (goalOwnerLease) {
            await ctx.fns.goal.ownerBarrier({action:'release',agentId:agent.id,runToken:goalOwnerLease.runToken,lease:goalOwnerLease});
            goalOwnerLease=null;
        }
        if (goalRun || nativeBinding()) {
            goalOwnerLease=await ctx.fns.goal.ownerBarrier({action:'acquire',agentId:agent.id,runToken:goalRun?.binding.runToken ?? runToken!});
            if (!goalOwnerLease || goalRun?.sealed || goalRun?.blocked) throw new DOMException('Goal accounting boundary busy or closed; retry explicitly', 'AbortError');
        }
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

            return Object.assign(goalReturn, { text: '', usage: null, consumedUserIdx });
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
            if ((complete || opts.omitGoalContinuationIdxs?.length) && await compactAtBoundary()) return Object.assign(goalReturn, { text: '', usage: null, consumedUserIdx });
        }

        // Keep the current prose in live memory for native clients. Persisting
        // every token would hammer Postgres; the final assistant event remains
        // the durable source of truth. A monotonically increasing revision lets
        // pollers replace one transient bubble without creating duplicates.
        await assertRunActive();
        const mobileStream = { text: "", revision: 0, startedAt: Date.now(), phase: 'streaming', thinking: false, thinkingStartedAt: null as number | null, thinkingSummary: '' };
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
        const goalRequestId = crypto.randomUUID();
        let goalProvider = 'unsupported';
        const goalFormat = 'common-stream' as const;
        const thinkingSpans: { startedAt: number; endedAt: number; summary: string }[] = [];
        let thinkingStart: number | null = null;
        const closeThinking = () => {
            if (thinkingStart === null) return;
            thinkingSpans.push({ startedAt: thinkingStart, endedAt: Date.now(), summary: mobileStream.thinkingSummary });
            mobileStream.thinkingSummary = '';
            thinkingStart = null;
        };
        try {
            const onEvent = (event: any) => {
                if (ac.signal.aborted || agent.abortController !== ac || sampling.signal.aborted || !['text_delta', 'thinking_delta'].includes(event?.type) || typeof event.delta !== 'string') return;
                // Expose only provider activity, never its private reasoning text.
                if (event.type === 'thinking_delta') {
                    mobileStream.thinking = true;
                    thinkingStart ??= Date.now();
                    mobileStream.thinkingStartedAt = thinkingStart;
                    if (event.visibility === 'public_summary') mobileStream.thinkingSummary = (mobileStream.thinkingSummary + event.delta).slice(0, 40000);
                } else {
                    closeThinking();
                    mobileStream.thinking = false;
                    mobileStream.text += event.delta;
                }
                mobileStream.revision++;
                if (streamTimer === undefined) streamTimer = setTimeout(() => {
                    streamTimer = undefined;
                    if (!ac.signal.aborted && agent.abortController === ac) notifyStream();
                }, 350);
            };
            if (goalRun) {
                const endpoint = await ctx.fns.llm.resolveEndpoint({ model: agent.model });
                goalProvider = endpoint.provider;

            }
            if (goalRun?.sealed) throw new DOMException('Run accounting sealed for Stop', 'AbortError');
            goalRun?.pendingRequests.add(goalRequestId);
            // Capture is immutable, but setup/admission failures are not execution failures.
            // Descendant authority must never let a child failure transition its root.
            if (!goalBindingReported && goalRun && !goalRun.binding.authority
                && goalRun.binding.rootAgentId === agent.id && goalRun.binding.sourceAgentId === agent.id) {
                goalBindingReported = true;
                opts.onGoalBinding?.(Object.freeze({ goalId: goalRun.binding.goalId, runToken: goalRun.binding.runToken }));
            }
            await ctx.fns.agent.retryWait({ agentId: agent.id, runToken: runToken ?? null, signal: ac.signal });
            await assertRunActive();
            streamed = await ctx.fns.llm.stream({ agent, signal: sampling.signal, onEvent });
            await ctx.fns.procs.db.run({ sql: 'UPDATE agents SET llm_retry_attempt = 0, llm_retry_pending = NULL WHERE id = ? AND stopped_at IS NULL AND (?::text IS NULL OR run_token = ?)', params: [agent.id, runToken ?? null, runToken ?? null] });
            if (goalRun) goalResult = await ctx.fns.goal.runUsageRecord({ state: goalRun, provider: goalProvider, requestId: goalRequestId, format: goalFormat, usage: streamed.usage });
        } catch (error: any) {
            if (goalRun) goalResult = await ctx.fns.goal.runUsageRecord({ state: goalRun, provider: goalProvider, requestId: goalRequestId, format: 'unsupported', usage: undefined });
            // Failed partial prose is never a durable assistant response.
            clearStream();
            if (sampling.signal.aborted && sampling.signal.reason === "new_user_input" && !ac.signal.aborted) {
                if (agent.samplingAbortController === sampling) agent.samplingAbortController = null;
                ac.signal.removeEventListener("abort", onRunAbort);
                // Nothing from the interrupted partial response is persisted.
                // The next loop refreshes the durable transcript and includes
                // every user message that arrived while sampling.
                if (completionReport) throw error;
                continue;
            }
            if (!sampling.signal.aborted && error?.name !== 'AbortError') {
                await assertRunActive();
                const provider = (await ctx.fns.llm.resolveEndpoint({ model: agent.model })).provider;
                const transport = error?.transportFailure;
                const classified = error?.failure ?? ctx.fns.llm.classifyError({ provider, body: String(error?.message ?? error) });
                const failure: types.llm.FailureInfo = transport?.kind === 'ssh_transport'
                    ? { ...classified, kind: transport.phase === 'permanent' ? 'fatal' : 'transient',
                        code: transport.phase === 'permanent' ? 'SSH_PERMANENT' : 'SSH_TRANSPORT',
                        retryable: transport.phase !== 'permanent', message: String(error?.message ?? error), provider }
                    : classified;
                if (await ctx.fns.agent.retrySchedule({ agentId: agent.id, runToken: runToken ?? null, failure, signal: ac.signal })) {
                    // A failed sample is not a completed tool cycle: always mode
                    // must not silently inherit the tool-loop retry count limit.
                    turns--;
                    // Replay model sampling only; completed tools/results remain durable.
                    continue;
                }
            }
            throw error;
        } finally {
            if (agent.samplingAbortController === sampling) agent.samplingAbortController = null;
            ac.signal.removeEventListener("abort", onRunAbort);
            sampling.signal.removeEventListener("abort", abortStream);
            const interrupted = thinkingStart !== null && (streamed === undefined || sampling.signal.aborted || ac.signal.aborted);
            closeThinking();
            // Persist timing and explicitly public summaries, never unclassified reasoning.
            // A replaced run must not write into its successor's transcript.
            if (agent.abortController === ac) {
                for (const [index, span] of thinkingSpans.entries()) {
                    await ctx.fns.session.appendEvent({ id: agent.id, ts: span.startedAt, event: {
                        type: 'thinking', startedAt: span.startedAt, endedAt: span.endedAt,
                        durationMs: Math.max(0, span.endedAt - span.startedAt),
                        publicSummary: span.summary || undefined,
                        status: interrupted && index === thinkingSpans.length - 1 ? 'interrupted' : 'completed',
                    } });
                }
            }
            mobileStream.thinking = false;
        }
        await assertRunActive();
        // Keep visible text until the durable tail replaces it in one swap.
        clearTimeout(streamTimer);
        streamTimer = undefined;
        mobileStream.phase = 'finalizing';
        mobileStream.thinking = false;
        const { text, usage } = streamed;
        let { finishReason, toolCalls = [] } = streamed;
        await ctx.fns.session.recordContextUsage({ id: agent.id, usage, metrics: streamed.metrics });
        await assertRunActive();
        let prose = String(text ?? '');
        // Account the just-finished request BEFORE authorizing its tool batch.
        // Unknown usage gets a bounded local summary, never another model/tool loop.
        if (goalRun) {
            goalResult = await ctx.fns.goal.runCheckpointFlush({ state: goalRun });
            await assertRunActive();
            refreshNativeRevision();
            if (goalResult.kind !== 'committed' || goalResult.status !== 'active') {
                toolCalls = [];
                finishReason = 'stop';
                if (goalResult.kind !== 'committed') {
                    await ctx.fns.session.appendErrorEvent({ id: agent.id, error: goalBoundarySummary });
                    prose = goalBoundarySummary;
                } else if (!(completionReport && goalResult.status === 'complete')) {
                    clearStream();
                    return Object.assign(goalReturn, { text: '', usage, consumedUserIdx });
                }
            }
        }
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
                lifecycleStatus = 'error';
                return Object.assign(goalReturn, { text: error, usage, consumedUserIdx });
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
        // Truncation is not a successful final answer, even when all tool JSON
        // happens to be valid. Never execute a partial batch or silently finish.
        if (finishReason === 'length' || finishReason === 'max_tokens') {
            clearStream();
            throw new Error('Model response reached its output token limit. No tools from this response were executed and no final answer was delivered. Continue from the saved checkpoint with a smaller response.');
        }
        if (!prose.trim() && toolCalls.length === 0) {
            clearStream();
            throw new Error('Model returned an empty response without text or tool calls. No final answer was delivered; the provider did not report an output token limit. Retry explicitly from the saved checkpoint.');
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
            const answerEvent = await ctx.fns.session.appendAssistantEvent({ id: agent.id, payload: {
                text: prose, html, usage, messageIdx: append.idx, instructionIndicators,
            } });
            candidateAnswerIdx = answerEvent.idx;
            await assertRunActive();
            await ctx.fns.session.syncAgentState({ agent });
            await assertRunActive();
        }
        clearStream(!!prose.trim());
        discardTransient = undefined;

            const goal = agent.goal;
        if (toolCalls.length === 0) {
            let automationAllowed = legacyAutomation && (await ctx.fns.planning.read({ agentId: agent.id })).mode !== 'plan';
            // Feature-off retains its original path. Feature-on with no Goal still
            // respects open human forms; a failed guard read cannot authorize work.
            if (automationAllowed && goalBinding.kind === 'absent') {
                try {
                    const rows = await ctx.fns.procs.db.select({ sql: "SELECT EXISTS(SELECT 1 FROM inputs WHERE agent_id=? AND state='open') AS pending_input", params: [agent.id] });
                    automationAllowed = rows[0]?.pending_input === false;
                } catch {
                    automationAllowed = false;
                }
                await assertRunActive();
            }
            if (automationAllowed && goal?.enabled && goal?.statement) {
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
            // Native Goal capability is unavailable: a plan is not a substitute
            // continuation channel, including pending-input and unknown boundaries.
            if (automationAllowed && activeTask && !plan.pausedAt && attempts < 2 && totalPlanInjections < 5) {
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
            finalAnswerIdx = candidateAnswerIdx;
            observeCompletedTurn(append.idx);
            goalCompleted = true;
            return Object.assign(goalReturn, { text: prose, usage, consumedUserIdx });
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
            const toolStartedAt = performance.now();
            const accountingBlocked = nativeHandoffFailed || nativeMutationStopped || (goalRun && (goalResult?.kind !== 'committed' || goalResult.status !== 'active'));
            const dispatchTool = () => {
                const binding = nativeBinding();
                return typeof ctx.fns.goal.toolScope === 'function'
                    ? ctx.fns.goal.toolScope({ action: binding ? 'with' : 'clear', binding, onMutation: binding ? onNativeMutation : undefined,
                        fn: () => ctx.fns.tools.call({ name: call.name, args: call.args, agent }),
                    }) as Promise<Awaited<ReturnType<typeof ctx.fns.tools.call>>>
                    : ctx.fns.tools.call({ name: call.name, args: call.args, agent });
            };
            const inputBlocked = await ctx.fns.input.isWaiting({ agentId: agent.id, since: inputWaitSince });
            const r = inputBlocked
                ? { handlerExecuted: false, isError: true, output: 'Not executed: this turn opened a blocking question. Wait for its answer before requesting further work.' }
                : accountingBlocked
                ? { handlerExecuted: false, isError: true, output: goalBoundarySummary }
                : goalRun
                    ? await ctx.fns.goal.delegationScope({ action: 'with', binding: goalRun.binding,
                        fn: dispatchTool,
                    }) as Awaited<ReturnType<typeof ctx.fns.tools.call>>
                    : await ctx.fns.goal.delegationScope({ action: 'clear',
                        fn: dispatchTool,
                    }) as Awaited<ReturnType<typeof ctx.fns.tools.call>>;
            const toolDurationMs = Math.max(0, performance.now() - toolStartedAt);
            await assertRunActive();
            const { content: output, result_ref } = await ctx.fns.agent.stashResult({ agent, output: r.output, kind: call.name });
            await assertRunActive();

            // Events store data, never rendered markup. renderEventHtml builds
            // the current view on every read, so renderer improvements apply to
            // old calls too (including edit diff cards).
            await ctx.fns.session.appendToolCallEvent({ id: agent.id, payload: {
                name: call.name, args: call.args, result: output, result_ref,
                isError: r.isError,
                durationMs: toolDurationMs,
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
            if (goalRun && r.handlerExecuted) {
                goalResult = await ctx.fns.goal.runCheckpointFlush({ state: goalRun });
                refreshNativeRevision();
                if (goalResult.kind === 'committed' && goalResult.budgetTransition && !terminal) {
                    await ctx.fns.goal.budgetSteer({ agentId: goalRun.binding.rootAgentId, goalIdentity: goalRun.binding.goalId, runToken: goalRun.binding.runToken });
                }
            }
        }
        await ctx.fns.session.syncAgentState({ agent });
        await assertRunActive();

        if (await ctx.fns.input.isWaiting({ agentId: agent.id, since: inputWaitSince })) {
            return Object.assign(goalReturn, { text: '', usage: null, consumedUserIdx, inputWaiting: true });
        }
        if (!terminal && (nativeHandoffFailed || nativeMutationStopped || (goalRun && (goalResult?.kind !== 'committed' || goalResult.status !== 'active')))) {
            if (!nativeHandoffFailed && nativeMutationStopped && nativeSnapshot?.status === 'complete'
                && goalResult?.kind === 'committed' && goalResult.status === 'complete' && !completionReport) {
                const completedGoal = await ctx.fns.goal.read({ agentId: agent.id });
                await assertRunActive();
                if (!completedGoal.enabled || !completedGoal.goal || completedGoal.goal.goalId !== nativeSnapshot.goalId) {
                    throw new Error('Completed Goal report accounting snapshot unavailable');
                }
                if (completedGoal.goal.status !== 'complete'
                    || (completedGoal.goal.tokenBudget !== null && completedGoal.goal.tokensUsed >= completedGoal.goal.tokenBudget)) {
                    return Object.assign(goalReturn, { text: '', usage, consumedUserIdx });
                }
                completionReport = true;
                agentCtx.goalCompletionReport = true;
                continue;
            }
            if (nativeHandoffFailed || goalResult?.kind !== 'committed') {
                await ctx.fns.session.appendErrorEvent({ id: agent.id, error: goalBoundarySummary });
                terminal = { type: 'html', text: goalBoundarySummary, html: `<p>${goalBoundarySummary}</p>` };
            } else {
                // Durable goal status already explains a deliberate stop; no duplicate chat bubble.
                return Object.assign(goalReturn, { text: '', usage, consumedUserIdx });
            }
        }
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
            const answerEvent = await ctx.fns.session.appendAssistantEvent({ id: agent.id, payload: {
                text, html, usage, messageIdx: final.idx, instructionIndicators,
            } });
            finalAnswerIdx = answerEvent.idx;
            await assertRunActive();
            await ctx.fns.session.syncAgentState({ agent });
            await assertRunActive();
            delete agent.scratchpad.activeStatusLine;
            observeCompletedTurn(final.idx);
            goalCompleted = true;
            return Object.assign(goalReturn, { text, html, usage, consumedUserIdx, terminal: true });
        }
        // Every side effect and tool-result replacement is durable now. Never
        // restart the turn or replay a tool batch to reclaim model context.
        if (await compactAtBoundary()) return Object.assign(goalReturn, { text: '', usage: null, consumedUserIdx });
    }
    } catch (error) {
        lifecycleStatus = ac.signal.aborted || (error instanceof Error && error.name === 'AbortError') ? 'stopped' : 'error';
        throw error;
    } finally {
        // A rejected cycle must not checkpoint concurrently with an external mutation.
        if (goalRun && !goalOwnerLease) goalOwnerLease=await ctx.fns.goal.ownerBarrier({action:'acquire',agentId:agent.id,runToken:goalRun.binding.runToken});
        if (goalRun && goalOwnerLease) {
            // Accounting must not mask the original exception or skip lifecycle cleanup.
            try {
                goalResult = await ctx.fns.goal.runCheckpointFlush({ state: goalRun });
                if (goalResult.kind === 'committed' && !goalRun.sealed && goalRun.pendingRequests.size === 0) {
                    opts.onGoalFinalCheckpoint?.(Object.freeze({ sourceAgentId: goalRun.binding.sourceAgentId,
                        sourceRunToken: goalRun.binding.runToken, goalId: goalRun.binding.goalId,
                        capabilityId: goalRun.binding.authority?.capabilityId,
                        checkpointId: goalResult.checkpointId, sequence: goalResult.sequence, drained: true }));
                }
                const goalModelToolAvailable = toolRole === 'root' && typeof ctx.fns.goal.nativeCapability === 'function'
                    && (await ctx.fns.goal.nativeCapability({ agentId: agent.id }).catch(() => ({ available: false }))).available;
                if (!nativeHandoffFailed && !nativeMutationStopped && goalModelToolAvailable && goalCompleted && !ac.signal.aborted && lifecycleStatus === 'completed' && goalResult.kind === 'committed' && goalResult.allowContinuation) {
                    goalReturn.goalContinuation = { goalId: goalRun.binding.goalId, revision: goalResult.revision, allowContinuation: true };
                }
                if (!goalRun.sealed) await ctx.fns.goal.runStopRegistry({ action: 'remove', agentId: agent.id, runToken: goalRun.binding.runToken, state: goalRun });
            } catch (error) {
                ctx.fns.procs.log.warn({ event: 'agent.run.goal.failed', msg: String(error), agentId: agent.id });
            }
        }
        if (goalOwnerLease) {
            await ctx.fns.goal.ownerBarrier({action:'release',agentId:agent.id,runToken:goalOwnerLease.runToken,lease:goalOwnerLease});
            goalOwnerLease=null;
        }
        if (lifecycleStarted) {
            try {
                await ctx.fns.agent.recordRunLifecycle({ agentId: agent.id, runId: lifecycleId,
                    status: ac.signal.aborted ? 'stopped' : lifecycleStatus, answerIdx: finalAnswerIdx });
            } catch (error) {
                // Metadata failure must not mask the execution error or skip ownership cleanup.
                ctx.fns.procs.log.warn({ event: 'agent.run.lifecycle.failed', msg: String(error), agentId: agent.id });
            }
        }
        discardTransient?.();
        agent.activeRunCount = Math.max(0, (agent.activeRunCount ?? 1) - 1);
        if (agent.abortController === ac) agent.abortController = null;
    }
}
