/**
 * Return a bounded transcript page, persistent mascot and live activity for native and web chat.
 * Choice, confirm, grid and secret input events expose identity only for history lookup; private forms and input HTML are never projected.
 * Retry rows expose safe failure metadata and their latest durable lifecycle state, including markers outside this page.
 * turnStartedAt is the durable worker-claim time for the current running turn,
 * including provider/tool waits; queued or stopped turns have no clock.
 * @param opts.req HTTP request with optional after, before and limit query parameters.
 * @param opts.params Route parameters containing the agent id.
 */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const id = opts.params.id!;
    const exists = ((await ctx.fns.procs.db.select({ sql: "SELECT 1 FROM agents WHERE id = ?", params: [id] })) as any[])[0];
    if (!exists) return Response.json({ error: "not_found", message: "Agent not found" }, { status: 404 });

    const url = new URL(opts.req.url);
    const afterRaw = url.searchParams.get("after");
    const beforeRaw = url.searchParams.get("before");
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 80) || 80));
    const maxIdx = await ctx.fns.session.getMaxEventIdx({ id });
    // Initial chat load is a backwards page ending at the current tail. Asking
    // getEvents from index zero with a limit returns the *oldest* page, which
    // made a newly opened native chat look reversed/stale and then advanced its
    // polling cursor past the unseen middle. Explicit `after` remains the live
    // incremental path; explicit `before` remains older-history pagination.
    const events = beforeRaw != null
        ? await ctx.fns.session.getEvents({ id, beforeIdx: Math.max(0, Number(beforeRaw) || 0), limit })
        : afterRaw != null
            ? await ctx.fns.session.getEvents({ id, fromIdx: Math.max(0, Number(afterRaw) || 0), limit })
            : await ctx.fns.session.getEvents({ id, beforeIdx: maxIdx + 1, limit });
    const status = ((await ctx.fns.procs.db.select({ sql: "SELECT mascot, run_state, run_started_at, next_run_at, last_error, archived_at FROM agents WHERE id = ?", params: [id] })) as any[])[0];
    const isRunning = status?.run_state === "running" || status?.run_state === "claimed" || status?.next_run_at != null;

    const toolPreview = (name: string, args: any): string => {
        const value = args && typeof args === "object" ? args : {};
        const first = (...keys: string[]) => keys.map((key) => value[key]).find((item) => typeof item === "string" && item.length > 0);
        const basename = (path: string) => path.replace(/\\/g, "/").split("/").filter(Boolean).pop() || path;
        switch (name) {
            case "read": return `Read ${basename(first("path", "file") || "file")}`;
            case "write": return `Write ${basename(first("path", "file") || "file")}`;
            case "edit": return `Edit ${basename(first("path", "file") || "file")}`;
            case "grep": return `Search ${first("pattern", "query") || "files"}`;
            case "find": return `Find ${first("pattern", "query") || "files"}`;
            case "bash": return `Run ${first("command")?.split("\n")[0] || "command"}`;
            case "eval": return `Evaluate ${first("code")?.split("\n")[0] || "code"}`;
            default: {
                const subject = first("path", "file", "query", "name", "id", "url");
                return subject ? `${name} ${subject}` : name;
            }
        }
    };
    // dsh deriveSummary priorities; separate from legacy mobile preview labels.
    const toolSummary = (name: string, args: Record<string, unknown> | null): string => {
        const value = args && typeof args === 'object' ? args : {};
        const kind = name.split('.').pop() || name;
        const firstLine = (text: string) => text.split(/\r?\n/, 1)[0] ?? '';
        const search = ['grep', 'find', 'glob'].includes(kind);
        if (search && Array.isArray(value.queries)) {
            const queries = value.queries.filter((item): item is string => typeof item === 'string' && item.length > 0);
            if (queries.length) return queries.map(firstLine).join(', ').slice(0, 1000);
        }
        const keys = kind === 'bash' ? ['description', 'command']
            : ['read', 'edit', 'write'].includes(kind) ? ['path', 'file_path', 'file', ...(kind === 'read' ? ['url'] : [])]
            : search ? ['query', 'pattern', 'url']
            : ['eval', 'tools_eval'].includes(kind) ? ['description'] : [];
        const picked = keys.map(key => value[key]).find(item => typeof item === 'string' && item.length > 0)
            ?? Object.values(value).find(item => typeof item === 'string' && item.length > 0);
        return (typeof picked === 'string' ? firstLine(picked) : Object.keys(value).length ? JSON.stringify(value) : '').slice(0, 1000);
    };

    const authors = new Map<string, Awaited<ReturnType<typeof ctx.fns.auth.author>>>();
    for (const event of events) {
        const keys = [typeof event.actor === 'string' ? event.actor : null,
            typeof event.agentMessage?.from === 'string' ? 'agent:' + event.agentMessage.from : null,
            typeof event.outgoingAgentMessage?.to === 'string' ? 'agent:' + event.outgoingAgentMessage.to : null];
        for (const key of keys) if (key && !authors.has(key) && (event.type === 'user' || key.startsWith('agent:'))) {
            authors.set(key, await ctx.fns.auth.author({ userId: key }));
        }
    }

    const mentioned = new Map<number, string[]>();
    for (const event of events) {
        if ((event.type === "user" || event.type === "assistant") && typeof event.text === "string" && event.text.includes("@")) {
            mentioned.set(Number(event.idx), await ctx.fns.mentions.parse({ text: event.text }));
        }
    }


    const linkedUsers = events.filter((event: any) => event.type === 'user' && typeof event.messageIdx === 'number').map((event: any) => event.messageIdx);
    const humanMessages = new Set<number>(linkedUsers.length ? (await ctx.fns.procs.db.select({
        sql: "SELECT idx FROM messages WHERE agent_id = ? AND idx = ANY(?::integer[]) AND role = 'user' AND coalesce(message_type, 'message') = 'message' AND coalesce(author, '') NOT LIKE 'agent:%'",
        params: [id, `{${linkedUsers.join(',')}}`],
    })).map((row: any) => Number(row.idx)) : []);

    // Persisted assistant tool_calls distinguish a final reply from commentary,
    // including legacy history whose run start is outside the loaded page.
    const assistantIds = events.filter((event: any) => event.type === 'assistant' && typeof event.messageIdx === 'number').map((event: any) => event.messageIdx);
    const finalReplies = new Set<number>(assistantIds.length ? (await ctx.fns.procs.db.select({
        sql: "SELECT idx FROM messages WHERE agent_id = ? AND idx = ANY(?::integer[]) AND role = 'assistant' AND (tool_calls IS NULL OR tool_calls = '[]'::jsonb)",
        params: [id, `{${assistantIds.join(',')}}`],
    })).map((row: any) => Number(row.idx)) : []);

    // Lifecycle markers are not transcript rows. Resolve them beyond the page so
    // older history does not show an already-started or cancelled retry as pending.
    const retryIds = [...new Set(events.filter(event => event.type === 'llm_retry' && typeof event.retryId === 'string').map(event => event.retryId as string))];
    const retryStates = new Map<string, 'started' | 'cancelled'>();
    if (retryIds.length) {
        const markers = await ctx.fns.procs.db.select({
            sql: `SELECT payload FROM events WHERE agent_id = ? AND payload::jsonb->>'type' IN ('llm_retry_started', 'llm_retry_cancelled') AND payload::jsonb->>'retryId' IN (${retryIds.map(() => '?').join(',')}) ORDER BY idx ASC`,
            params: [id, ...retryIds],
        });
        for (const row of markers) {
            const marker = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
            if (marker?.type === 'llm_retry_started' || marker?.type === 'llm_retry_cancelled') {
                retryStates.set(JSON.stringify([marker.retryId, marker.retry]), marker.type === 'llm_retry_started' ? 'started' : 'cancelled');
            }
        }
    }

    // Plugin inputs join chat history only when their kind declares a server history summary;
    // private forms (logins etc.) without the hook stay out of the transcript.
    const inputKinds = (ctx.state as Context['state'] & { input?: { kinds?: Record<string, types.input.Registered> } }).input?.kinds ?? {};
    const historyKind = (kind: unknown) => typeof kind === 'string' && (['choice', 'confirm', 'grid', 'secret'].includes(kind) || typeof inputKinds[kind]?.history === 'function');
    const mobileEvents = events
        .filter((event: any) => (event.type === 'input' && historyKind(event.kind) && typeof event.inputId === 'string') || ["user", "assistant", "error", "tool_call", "tool_result", "thinking", "stop", "agent_message_outgoing", "compaction_start", "compaction_completed", "compaction_failed", "planning_mode", "planning_proposal", "command_invocation", "command_result", "llm_retry", "tool_busy", "tool_aborted", "goal_transition", "parked", "unparked", "model_changed", "team_update", "wake_up", "canvas_ping", "plan_activation", "goal_activation", "goal_check", "attempt", "attachment_event", "user_message"].includes(String(event.type)))
        .map((event: any) => ({
            ...(event.type === 'input' ? { inputId: event.inputId, kind: event.kind, ...(['choice', 'confirm', 'grid', 'secret'].includes(event.kind) ? {} : { pluginHistory: true }) } : {}),
            ...(event.type === 'llm_retry' ? {
                retryId: typeof event.retryId === 'string' ? event.retryId : null,
                retry: typeof event.retry === 'number' ? event.retry : null,
                maxRetries: typeof event.maxRetries === 'number' ? event.maxRetries : null,
                retryMode: typeof event.mode === 'string' ? event.mode : null,
                delayMs: typeof event.delayMs === 'number' ? event.delayMs : null,
                failureCode: typeof event.failure?.code === 'string' ? event.failure.code : null,
                failureMessage: typeof event.failure?.message === 'string' ? event.failure.message : null,
                failureStatus: typeof event.failure?.status === 'number' ? event.failure.status : null,
                provider: typeof event.provider === 'string' ? event.provider : null,
                retryState: retryStates.get(JSON.stringify([event.retryId, event.retry])) ?? 'scheduled',
            } : {}),
            idx: Number(event.idx),
            // Transcript grouping follows durable message identity, never tool names.
            // UI-only command notices have no linked message and do not start turns.
            messageIdx: typeof event.messageIdx === 'number' ? event.messageIdx : null,
            ts: Number(event.ts),
            type: String(event.type),
            // Display-only lifecycle metadata. Never spread event payloads, credentials or form state.
            lifecycle: (() => {
                const fields: Record<string, string[]> = {
                    parked: ['provider', 'account', 'message', 'resetsAt', 'wakeAt'],
                    unparked: ['reason', 'resumed'], model_changed: ['from', 'to'],
                    team_update: ['event', 'memberId', 'taskId', 'taskTitle', 'summary'],
                    wake_up: ['watchId', 'triggerId', 'triggerKind', 'watchStatus', 'prompt', 'reason', 'summary', 'resultPreview', 'cronExpression', 'timezone', 'scheduleId'],
                    canvas_ping: ['title'], plan_activation: ['title', 'taskId', 'instructions'],
                    goal_activation: ['iterations'], goal_check: ['status', 'iteration', 'maxIterations', 'reason', 'nextStep'],
                    attempt: ['error'], attachment_event: ['source', 'eventType'],
                };
                const scheduled = ['user', 'user_message'].includes(String(event.type)) && event.automationKind === 'scheduled';
                const keys = scheduled ? ['automationKind', 'triggerKind', 'cronExpression', 'timezone', 'prompt', 'reason', 'summary', 'content', 'scheduleId', 'triggerId'] : fields[String(event.type)];
                if (!keys) return null;
                const display: Record<string, string | number | boolean> = {};
                for (const key of keys) {
                    const value = event[key];
                    if (typeof value === 'string') display[key] = value;
                    else if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) display[key] = value;
                }
                if (event.type === 'wake_up' && typeof event.resultRef?.id === 'string') display.resultId = event.resultRef.id;
                // Canvas/watch data is intentionally a bounded inert text preview, not a new executable surface.
                const data = event.type === 'canvas_ping' ? event.data : event.type === 'wake_up' ? event.result : undefined;
                if (data != null) display.dataPreview = JSON.stringify(data).slice(0, 16000);
                if (event.type === 'attachment_event') {
                    for (const key of ['chatTitle', 'chatId', 'senderName', 'senderId', 'text', 'summary']) {
                        const value = event.payload?.[key];
                        if (typeof value === 'string' || typeof value === 'number') display[key] = String(value);
                    }
                }
                return display;
            })(),
            excludedFromLlm: event.excludedFromLlm === true,
            ...(event.type === 'planning_mode' && typeof event.operationId === 'string' ? {operationId:event.operationId,requestId:event.requestId ?? null} : {}),
            command: event.command && typeof event.command === 'object' ? event.command : typeof event.command === 'string' ? {name:event.command} : null,
            ...(['command_invocation','command_result'].includes(String(event.type)) ? {
                commandName: String(event.commandName ?? ''), commandText: String(event.commandText ?? ''), argsText: String(event.argsText ?? ''),
                requestId: String(event.requestId ?? ''), operationId: String(event.operationId ?? ''), status: String(event.status ?? ''),
                result: event.result ?? null, error: event.error ?? null,
            } : {}),
            isFinalReply: event.type === 'assistant' ? finalReplies.has(event.messageIdx) : undefined,
            text: event.type === 'thinking' || event.type === 'input' ? null : typeof event.text === "string" ? event.text : (typeof event.error === "string" ? event.error : null),
            mentions: mentioned.get(Number(event.idx)) ?? [],
            html: event.type === 'thinking' || event.type === 'input' ? null : typeof event.html === "string" ? event.html : null,
            // Only the explicit terminal answer path opts in; historical rendered markdown is not proof.
            htmlSource: event.type === 'assistant' && event.htmlSource === 'assistant-answer' && typeof event.html === 'string' ? 'assistant-answer' : null,
            actor: typeof event.actor === 'string' ? event.actor : null,
            navigationEligible: event.type === 'user' && humanMessages.has(event.messageIdx)
                && !String(event.actor || '').startsWith('agent:') && !event.agentMessage && !event.outgoingAgentMessage
                && !/^<(?:agent-message|team-update|input-result|canvas-ping)(?:\s|>)/.test(String(event.text || '').trimStart()),
            author: typeof event.actor === "string" ? authors.get(event.actor) ?? null : null,
            peerAuthor: event.outgoingAgentMessage?.to ? authors.get('agent:' + event.outgoingAgentMessage.to) ?? null : null,
            agentMessage: event.agentMessage && typeof event.agentMessage.from === 'string' ? {
                from: event.agentMessage.from, title: typeof event.agentMessage.title === 'string' ? event.agentMessage.title : undefined,
                body: typeof event.agentMessage.body === 'string' ? event.agentMessage.body : '',
                hop: typeof event.agentMessage.hop === 'number' ? event.agentMessage.hop : undefined,
            } : null,
            outgoingAgentMessage: event.outgoingAgentMessage && typeof event.outgoingAgentMessage.to === 'string' ? {
                to: event.outgoingAgentMessage.to, title: typeof event.outgoingAgentMessage.title === 'string' ? event.outgoingAgentMessage.title : undefined,
                body: typeof event.outgoingAgentMessage.body === 'string' ? event.outgoingAgentMessage.body : '',
                status: event.outgoingAgentMessage.status === 'delivered' ? 'delivered' : 'queued',
                messageIdx: typeof event.outgoingAgentMessage.messageIdx === 'number' ? event.outgoingAgentMessage.messageIdx : null,
            } : null,
            name: typeof event.name === "string" ? event.name : null,
            ...(['tool_busy', 'tool_aborted'].includes(String(event.type)) ? {
                runId: typeof event.runId === 'string' ? event.runId : null,
                subject: typeof event.subject === 'string' ? event.subject : null,
                elapsedSec: typeof event.elapsedSec === 'number' && Number.isFinite(event.elapsedSec) ? Math.max(0, event.elapsedSec) : null,
                timeoutMs: typeof event.timeoutMs === 'number' && Number.isFinite(event.timeoutMs) && event.timeoutMs > 0 ? event.timeoutMs : null,
            } : {}),
            toolSummary: event.type === 'tool_call' || event.type === 'tool_result'
                ? toolSummary(String(event.name || 'tool'), event.args) : null,
            preview: event.type === "tool_call"
                ? toolPreview(String(event.name || "Tool"), event.args)
                : (event.type !== 'thinking' && typeof event.text === "string" ? event.text.slice(0, 180) : null),
            isError: event.isError === true,
            ...(event.type === 'tool_call' || event.type === 'tool_result' ? {
                durationMs: typeof event.durationMs === 'number' && Number.isFinite(event.durationMs) && event.durationMs >= 0 ? event.durationMs : null,
                // tools.call registers a deadline only from the tool's explicit seconds argument.
                timeoutMs: typeof event.args?.timeout === 'number' && Number.isFinite(event.args.timeout) && event.args.timeout > 0 ? event.args.timeout * 1000 : null,
            } : {}),
            ...(event.type === 'thinking' ? {
                publicSummary: typeof event.publicSummary === 'string' ? event.publicSummary.slice(0, 40000) : null,
                durationMs: typeof event.durationMs === 'number' ? event.durationMs : null,
                thinkingStatus: event.status === 'interrupted' ? 'interrupted' : 'completed',
            } : {}),
            ...(String(event.type).startsWith('compaction_') ? {
                revision: typeof event.revision === 'number' ? event.revision : null,
                summary: typeof event.summary === 'string' ? event.summary : null,
                tokensBefore: typeof event.tokensBefore === 'number' ? event.tokensBefore : null,
                tokensAfter: typeof event.tokensAfter === 'number' ? event.tokensAfter : null,
                tokensBeforeSource: event.tokensBeforeSource === 'provider' || event.tokensBeforeSource === 'estimate' ? event.tokensBeforeSource : null,
                tokensAfterEstimated: event.tokensAfterEstimated === true,
                keptMessages: typeof event.keptMessages === 'number' ? event.keptMessages : null,
            } : {}),
            attachments: Array.isArray(event.attachments) ? event.attachments.map((attachment: any) => ({
                id: attachment.id == null ? null : String(attachment.id),
                name: attachment.name ?? attachment.fileName ?? null,
                contentType: attachment.contentType ?? attachment.mimeType ?? null,
                size: attachment.size == null ? null : Number(attachment.size),
            })) : [],
        }));

    // Goal lifecycle lives in its own audit table. Project each transition next to
    // the last event written before it so the transcript shows start/pause/resume
    // inside the same work group as tools. Fractional idx keeps durable idx intact.
    if (events.length) {
        const first = events[0], last = events[events.length - 1];
        const lower = Number(first.idx) > 0 ? Number(first.ts) : -1;
        const next = Number(last.idx) < maxIdx ? ((await ctx.fns.procs.db.select({ sql: 'SELECT ts FROM events WHERE agent_id = ? AND idx > ? ORDER BY idx ASC LIMIT 1', params: [id, Number(last.idx)] })) as any[])[0] : null;
        const upper = next && Number.isFinite(Number(next.ts)) ? Number(next.ts) : Number.MAX_SAFE_INTEGER;
        const rows = await ctx.fns.procs.db.select({
            sql: 'SELECT t.id, t.origin, t.before_status, t.after_status, t.created_at, g.objective FROM goal_transition_events t LEFT JOIN agent_goals g ON g.agent_id = t.agent_id AND g.goal_id = t.goal_id WHERE t.agent_id = ? AND t.created_at >= ? AND t.created_at < ? ORDER BY t.created_at ASC, t.id ASC LIMIT 200',
            params: [id, lower, upper],
        }).catch(() => [] as any[]) as any[]; // goal schema absent or disabled: transcript still renders
        const offsets = new Map<number, number>();
        for (const row of rows) {
            const at = Number(row.created_at);
            if (!Number.isFinite(at) || row.before_status === row.after_status) continue;
            const anchor = [...events].reverse().find((event: any) => Number(event.ts) <= at);
            const base = anchor ? Number(anchor.idx) : Number(first.idx) - 1;
            const n = (offsets.get(base) ?? 0) + 1;
            offsets.set(base, n);
            mobileEvents.push({
                idx: base + n / 1000, messageIdx: null, ts: at, type: 'goal_transition', text: typeof row.objective === 'string' ? row.objective : null,
                goalStatus: row.after_status ?? null, goalBeforeStatus: row.before_status ?? null, goalOrigin: String(row.origin ?? ''),
                mentions: [], html: null, actor: null, navigationEligible: false, author: null, peerAuthor: null, agentMessage: null, outgoingAgentMessage: null, name: null, attachments: [],
            } as any);
        }
        mobileEvents.sort((a: any, b: any) => a.idx - b.idx);
    }

    const liveAgent = (ctx.state as any).agent?.[id];
    const stream = liveAgent?.scratchpad?.mobileStream;
    const streamHandoff = liveAgent?.scratchpad?.streamHandoff === true;
    const partial = isRunning && typeof stream?.text === "string" && stream.text.length > 0
        ? { text: stream.text, revision: Number(stream.revision ?? 0), startedAt: Number(stream.startedAt ?? Date.now()) }
        : null;

    // Durable ranges let a partial page retain its real run boundary. Older
    // history without lifecycle records intentionally has no invented identity.
    const firstEventIdx = events.length ? Number(events[0].idx) : maxIdx + 1;
    const lastEventIdx = events.length ? Number(events[events.length - 1].idx) : maxIdx;
    const runRows = await ctx.fns.procs.db.select({
        sql: 'SELECT * FROM (SELECT id, start_idx, COALESCE(end_idx, LEAD(start_idx) OVER (ORDER BY start_idx) - 1) AS end_idx, started_at, ended_at, status, answer_idx, has_interleaved_input FROM agent_runs WHERE agent_id = ?) ranges WHERE start_idx <= ? AND (end_idx IS NULL OR end_idx >= ?) ORDER BY start_idx',
        params: [id, lastEventIdx, firstEventIdx],
    });
    const runs = runRows.map((run: any) => ({
        id: String(run.id), startIdx: Number(run.start_idx), endIdx: run.end_idx == null ? null : Number(run.end_idx),
        startedAt: Number(run.started_at), endedAt: run.ended_at == null ? null : Number(run.ended_at),
        status: String(run.status), answerIdx: run.answer_idx == null ? null : Number(run.answer_idx),
        hasInterleavedInput: run.has_interleaved_input === true,
    }));

    return Response.json({
        runs,
        version: 1,
        agentId: id,
        mascot: status.mascot as 'crab' | 'deepy' | 'whalegirl' | 'desksprite' | 'bitty' | 'tmuxai' | 'planet' | 'rainbow-terminal-cat',
        events: mobileEvents,
        activeTools: (ctx.fns.tools?.runs?.({ agentId: id }) ?? []).map(run => ({
            id: run.id, name: run.name, subject: run.subject.slice(0, 500), startedAt: run.startedAt,
            timeoutMs: run.timeoutMs,
            state: run.aborted ? 'stopping' : 'running', tail: run.tail.slice(-12000),
        })),
        nextAfter: maxIdx + 1,
        olderBefore: events.length > 0 ? Number(events[0]?.idx ?? 0) : null,
        hasOlder: events.length > 0 && Number(events[0]?.idx ?? 0) > 0,
        isRunning,
        archived: status?.archived_at != null,
        runState: status?.run_state || "idle",
        lastError: status?.last_error || null,
        partial,
        streamHandoff,
        // Do not infer a turn start from the latest tool, thinking phase or queued wake.
        turnStartedAt: (status?.run_state === 'running' || status?.run_state === 'claimed')
            && status?.run_started_at != null && Number.isFinite(Number(status.run_started_at))
            ? Number(status.run_started_at) : null,
        activityStartedAt: isRunning && typeof stream?.startedAt === 'number' ? stream.startedAt : null,
        thinking: isRunning && stream?.thinking === true && stream?.phase === 'streaming'
            ? { startedAt: Number(stream.thinkingStartedAt ?? stream.startedAt), publicSummary: typeof stream.thinkingSummary === 'string' ? stream.thinkingSummary.slice(0, 40000) : '' } : null,
    });
}
