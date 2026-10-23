/**
 * Persist a submitted chat turn with attachments and schedule its agent.
 *
 * Shared existing chat HTTP submission pipeline; callers must authenticate and resolve the durable agent before calling.
 * A newly accepted human turn resumes a paused plan atomically with enqueueing. Duplicate retries do not resume it.
 * @param opts.req Text or multipart chat request.
 * @param opts.params Route values containing the existing agent id.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Text or multipart chat request. */
        req: Request;
        /** Route values containing the existing agent id. */
        params: Record<string, string>;
    },
): Promise<Response> {
    const req = opts.req;
        const id = opts.params.id!;
        let agent = (ctx.state as any).agent?.[id];
        if (!agent) {
            agent = (await ctx.fns.session.load({ id })) ?? null;
            if (agent) { (ctx.state as any).agent ??= {}; (ctx.state as any).agent[id] = agent; }
        }
        if (!agent) return Response.json({ error: "not found" }, { status: 404 });

        let text = "";
        let requestId = req.headers.get("idempotency-key")?.trim() ?? "";
        let files: File[] = [];
        const ct = String(req.headers.get("content-type") ?? "");
        if (ct.startsWith("multipart/form-data") || ct.startsWith("application/x-www-form-urlencoded")) {
            const form = await req.formData();
            requestId ||= typeof form.get("requestId") === "string" ? String(form.get("requestId")).trim() : "";
            if (form.has("text")) text = typeof form.get("text") === "string" ? String(form.get("text")).trim() : "";
            else {
                const lines: string[] = [];
                for (const [name, value] of form.entries()) if (typeof value === "string") lines.push(`${name}: ${value}`);
                text = lines.join("\n").trim();
            }
            files = [...form.getAll("files"), ...form.getAll("file")].filter(value => value instanceof File && value.size > 0) as File[];
        } else text = (await req.text()).trim();
        if (!text && files.length === 0) return Response.json({ error: "empty input" }, { status: 400 });

        if (files.length > 10 || files.some(file => file.size > 25 * 1024 * 1024) || files.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024) return Response.json({ error: 'Не более 10 файлов, до 25 МБ каждый и 50 МБ суммарно.' }, { status: 400 });
        // The fingerprint binds the idempotency key to text AND exact file bytes.
        const digests = await Promise.all(files.map(async file => ({ name: file.name, type: file.type, hash: new Bun.CryptoHasher('sha256').update(await file.arrayBuffer()).digest('hex') })));
        const fingerprint = new Bun.CryptoHasher('sha256').update(JSON.stringify({ text, files: digests })).digest('hex');
        const ts = Date.now();
        const actor = await ctx.fns.auth.actorId({ agentId: id }) ?? null;
        const url = new URL(req.url);
        const explicitSeconds = url.searchParams.get('debounceSeconds');
        const perAgent = await ctx.fns.settings.getNumber({ module: 'ui', scopeType: 'agent', scopeId: id, key: 'debounceMs' });
        const declared = await ctx.fns.settings.getNumber({ module: 'agent', scopeType: 'global', key: 'debounceMs' });
        const sendAt = ts + (explicitSeconds != null ? Math.max(0, Number(explicitSeconds) * 1000) : (perAgent ?? declared ?? 5000));
        let uploads: Awaited<ReturnType<typeof ctx.fns.attachments.saveUploads>> = [];
        // Cheap preflight avoids repeated file work for completed keys. The same
        // check is repeated under the transaction lock to handle racing requests.
        if (requestId) {
            const existing = (await ctx.fns.procs.db.select({ sql: `SELECT m.idx, e.payload FROM messages m LEFT JOIN events e ON e.agent_id=m.agent_id AND e.type='user' AND (e.payload::jsonb->>'messageIdx')=m.idx::text WHERE m.agent_id=? AND m.client_request_id=? LIMIT 1`, params: [id, requestId] }))[0] as { idx: number; payload: string | Record<string, unknown> | null } | undefined;
            if (existing) {
                const payload = typeof existing.payload === 'string' ? JSON.parse(existing.payload) : existing.payload;
                if (!payload?.submissionFingerprint || payload.submissionFingerprint !== fingerprint) return Response.json({ error: 'Этот ключ уже использован или прежняя отправка не завершена. Проверьте историю чата.' }, { status: 409 });
                if (req.headers.get('hx-request') === 'true') return new Response(null, { status: 204, headers: { 'x-chat-message-idx': String(existing.idx) } });
                return Response.json({ ok: true, duplicate: true, messageIdx: Number(existing.idx) });
            }
        }
        try { uploads = await ctx.fns.attachments.saveUploads({ agentId: id, files }); }
        catch (error) { return Response.json({ error: String(error instanceof Error ? error.message : error) }, { status: 400 }); }
        let userAppend: { idx: number; duplicate?: boolean } = { idx: -1 };
        // Other writers do not take this lock: retry the WHOLE transaction on an
        // idx collision, never just a statement in an aborted transaction.
        for (let attempt = 0; ; attempt++) {
            try {
                userAppend = await ctx.fns.procs.db.transaction({ fn: async () => {
                    await ctx.fns.procs.db.select({ sql: 'SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', params: ['chat-submit:' + id] });
                    if (requestId) {
                        const existing = (await ctx.fns.procs.db.select({ sql: `SELECT m.idx, e.payload FROM messages m LEFT JOIN events e ON e.agent_id=m.agent_id AND e.type='user' AND (e.payload::jsonb->>'messageIdx')=m.idx::text WHERE m.agent_id=? AND m.client_request_id=? LIMIT 1`, params: [id, requestId] }))[0] as { idx: number; payload: string | Record<string, unknown> | null } | undefined;
                        if (existing) {
                            const payload = typeof existing.payload === 'string' ? JSON.parse(existing.payload) : existing.payload;
                            if (!payload?.submissionFingerprint || payload.submissionFingerprint !== fingerprint) throw new Error('SUBMISSION_CONFLICT');
                            return { idx: Number(existing.idx), duplicate: true };
                        }
                    }
                    // Serialize human resumption with inbound delivery and scratchpad writes.
                    // Only a NEW accepted human turn resumes a plan; retries return above.
                    await ctx.fns.procs.db.select({ sql: 'SELECT id FROM agents WHERE id=? FOR UPDATE', params: [id] });
                    await ctx.fns.session.mutateScratchpad({ id, mutate: (scratchpad: Record<string, any>, now: number) => {
                        const plan = scratchpad.plan;
                        if (!plan?.pausedAt) return;
                        plan.pausedAt = null;
                        plan.updatedAt = now;
                        const active = Array.isArray(plan.tasks) ? plan.tasks.find((task: any) => task.status === 'active') : null;
                        if (active && !active.activeSince) active.activeSince = now;
                    } });
                    const safeText = await ctx.fns.session.scrubUnicode({ text });
                    const content: types.tools.Content[] = safeText ? [{ type: 'text', text: safeText }] : [];
                    content.push(...uploads.map(item => item.ref));
                    const stored = await ctx.fns.session.scrubUnicode({ text: uploads.length ? JSON.stringify(content) : safeText });
                    const inserted = await ctx.fns.procs.db.run({ sql: `INSERT INTO messages (agent_id, idx, role, content, ts, author, client_request_id) SELECT ?, COALESCE(MAX(idx), -1)+1, 'user', ?, ?, ?, ? FROM messages WHERE agent_id=? RETURNING idx`, params: [id, stored, ts, actor, requestId || null, id] });
                    const idx = Number((inserted.rows as Array<{ idx: number }>)[0]!.idx);
                    if (uploads.length) await ctx.fns.attachments.commitUploads({ agentId: id, messageIdx: idx, uploads });
                    const event = { type: 'user', text: safeText, attachments: uploads.map(item => item.meta), messageIdx: idx, ts, actor, submissionFingerprint: fingerprint, html: '' };
                    event.html = await ctx.fns.agent.renderEventHtml({ event, agentId: id });
                    const payload = await ctx.fns.session.scrubUnicode({ text: JSON.stringify(event) });
                    await ctx.fns.procs.db.run({ sql: `INSERT INTO events (agent_id, idx, type, payload, ts, actor) SELECT ?, COALESCE(MAX(idx), -1)+1, 'user', ?, ?, ? FROM events WHERE agent_id=?`, params: [id, payload, ts, actor, id] });
                    await ctx.fns.procs.db.run({ sql: `UPDATE agents SET stopped_at=NULL, last_error=NULL, next_run_at=GREATEST(COALESCE(next_run_at,0),?), updated_at=? WHERE id=?`, params: [sendAt, ts, id] });
                    return { idx };
                } }) as { idx: number; duplicate?: boolean };
                break;
            } catch (error) {
                const message = String(error instanceof Error ? error.message : error);
                if (message === 'SUBMISSION_CONFLICT') return Response.json({ error: 'Этот ключ уже использован или прежняя отправка не завершена. Проверьте историю чата.' }, { status: 409 });
                if (attempt >= 9 || !/duplicate key|messages_pkey|events_pkey|deadlock detected|serialization failure/i.test(message)) throw error;
                await Bun.sleep(3 + Math.random() * 20 * (attempt + 1));
            }
        }
        if (userAppend.duplicate) {
            if (req.headers.get('hx-request') === 'true') return new Response(null, { status: 204, headers: { 'x-chat-message-idx': String(userAppend.idx) } });
            return Response.json({ ok: true, duplicate: true, messageIdx: userAppend.idx });
        }
        // Durable acceptance committed. Notification failures cannot undo it.
        try {
            await ctx.fns.session.syncAgentState({ agent });
            await ctx.fns.agent.wakeWaiters({ agentId: id });
            ctx.fns.procs.events.refresh({ topic: `agent:${id}`, reason: 'event' });
            if (text.includes('@')) await ctx.fns.mentions.record({ agentId: id, messageIdx: userAppend.idx, text, from: actor });

        // A message that arrives mid-tool-call used to vanish into the queue
        // with no acknowledgement — the "hello?" / "what is going on?" case. Say out loud that
        // it was received, what is holding the agent up, and offer the one
        // action that actually unblocks it.
        //
        // Only for calls already slow enough to be worth explaining: a card
        // saying "busy: eval has been running for 1 s" is noise, and noise is what trained the
        // user to stop reading these in the first place.
        //
        // Once per call, not once per message: someone who writes "hello?" and then
        // "any update?" gets the same answer twice, and a column of identical
        // cards reads as the UI being stuck too. The first card stays true for
        // as long as the call runs — it has a live timer and a working Stop
        // button — so repeating it adds nothing but noise.
        const BUSY_NOTICE_AFTER_MS = 10_000;
        if (text) {
            const running = ctx.fns.tools.runs({ agentId: id })[0];
            const elapsed = running ? Date.now() - running.startedAt : 0;
            const alreadyToldAbout = running
                ? (agent.events ?? []).some((ev: any) => ev?.type === "tool_busy" && ev?.runId === running.id)
                : false;
            if (running && !alreadyToldAbout && elapsed >= BUSY_NOTICE_AFTER_MS) {
                const busy: any = {
                    type: "tool_busy",
                    name: running.name,
                    subject: running.subject,
                    runId: running.id,
                    elapsedSec: Math.round(elapsed / 1000),
                    timeoutMs: running.timeoutMs,
                    ts: Date.now(),
                };
                busy.html = await ctx.fns.agent.renderEventHtml({ event: busy, agentId: id });
                await ctx.fns.session.appendEvent({ id, event: busy, ts: busy.ts });
            }
        }

        // Instant steering cancels only the active provider request. The durable
        // run and worker lease continue; agent.run refreshes history and samples
        // again. Tool execution has no sampling controller, so tools finish at
        // their safe boundary before the new input is consumed.
        if (agent.isStreaming && agent.samplingAbortController && !agent.samplingAbortController.signal.aborted) {
            try { agent.samplingAbortController.abort("new_user_input"); } catch {}
        }
    
        // Display-only observer: it runs independently and never changes the
        // execution goal, queue cursor, or transcript of this agent.
        if (text && agent.scratchpad?.goalTrackingEnabled === true && ctx.fns.agent.updateGoalSidecar) void ctx.fns.agent.updateGoalSidecar({ agent, messageIdx: userAppend.idx, userMessage: text }).catch(() => undefined);
        } catch (error) {
            console.warn('Chat accepted; post-commit notification failed', id, error);
        } finally {
            try { ctx.fns.agent.wakeWorker({}); }
            catch (error) { console.warn('Chat accepted; worker notification failed', id, error); }
        }

        if (req.headers.get('hx-request') === 'true') return new Response(null, { status: 204, headers: { 'x-chat-message-idx': String(userAppend.idx) } });
        if (String(req.headers.get("accept") ?? "").includes("text/html")) return new Response(null, { status: 303, headers: { location: `/agent/${encodeURIComponent(id)}` } });
        return Response.json({ ok: true, sendAt, messageIdx: userAppend.idx, attachments: uploads.map(item => item.meta) });
}
