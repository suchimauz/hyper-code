/**
 * Return a bounded transcript page, persistent mascot and live activity for native and web chat.
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

    const mobileEvents = events
        .filter((event: any) => ["user", "assistant", "error", "tool_call", "tool_result", "thinking", "stop", "agent_message_outgoing", "compaction_start", "compaction_completed", "compaction_failed", "planning_mode", "planning_proposal", "command_invocation", "command_result"].includes(String(event.type)))
        .map((event: any) => ({
            idx: Number(event.idx),
            // Transcript grouping follows durable message identity, never tool names.
            // UI-only command notices have no linked message and do not start turns.
            messageIdx: typeof event.messageIdx === 'number' ? event.messageIdx : null,
            ts: Number(event.ts),
            type: String(event.type),
            ...(event.type === 'planning_mode' && typeof event.operationId === 'string' ? {operationId:event.operationId,requestId:event.requestId ?? null} : {}),
            command: event.command && typeof event.command === 'object' ? event.command : typeof event.command === 'string' ? {name:event.command} : null,
            ...(['command_invocation','command_result'].includes(String(event.type)) ? {
                commandName: String(event.commandName ?? ''), commandText: String(event.commandText ?? ''), argsText: String(event.argsText ?? ''),
                requestId: String(event.requestId ?? ''), operationId: String(event.operationId ?? ''), status: String(event.status ?? ''),
                result: event.result ?? null, error: event.error ?? null,
            } : {}),
            isFinalReply: event.type === 'assistant' ? finalReplies.has(event.messageIdx) : undefined,
            text: event.type === 'thinking' ? null : typeof event.text === "string" ? event.text : (typeof event.error === "string" ? event.error : null),
            mentions: mentioned.get(Number(event.idx)) ?? [],
            html: event.type === 'thinking' ? null : typeof event.html === "string" ? event.html : null,
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
                keptMessages: typeof event.keptMessages === 'number' ? event.keptMessages : null,
            } : {}),
            attachments: Array.isArray(event.attachments) ? event.attachments.map((attachment: any) => ({
                id: attachment.id == null ? null : String(attachment.id),
                name: attachment.name ?? attachment.fileName ?? null,
                contentType: attachment.contentType ?? attachment.mimeType ?? null,
                size: attachment.size == null ? null : Number(attachment.size),
            })) : [],
        }));

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
