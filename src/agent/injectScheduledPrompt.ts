/**
 * Injects a scheduled prompt into one agent transcript
 *
 * Append a cron prompt and schedule the worker only when the agent is not stopped.
 * Hold the agent row lock through append and scheduling; stopped agents return
 * scheduled:false without changing their transcript or durable stop marker.
 * Use as the target of recurring Agent schedules.
 * @param opts.agentId Target agent identifier.
 * @param opts.text Fixed prompt injected on each schedule occurrence.
 * @param opts.scheduleId Stable schedule name recorded on the UI event; transcript text and message type stay unchanged.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Target agent identifier. */
        agentId: string;
        /** Fixed prompt injected on each schedule occurrence. */
        text: string;
        /** Stable schedule name recorded on the UI event; transcript text and message type stay unchanged. */
        scheduleId?: string;
    },
): Promise<{ agentId: string; messageIdx: number; scheduled: true } | { agentId: string; messageIdx: null; scheduled: false; reason: "stopped" }> {
    const id=String(opts.agentId??"").trim(),text=String(opts.text??"").trim();
    if(!id)throw new Error("agentId is required");if(!text)throw new Error("scheduled prompt is empty");if(text.length>20000)throw new Error("scheduled prompt exceeds 20000 characters");
    const message = await ctx.fns.procs.db.transaction({ fn: async () => {
        const row = (await ctx.fns.procs.db.select({
            sql: "SELECT id, stopped_at FROM agents WHERE id=? AND archived_at IS NULL FOR UPDATE", params: [id],
        }) as { id: string; stopped_at: number | null }[])[0];
        if (!row) throw new Error(`agent not found: ${id}`);
        if (row.stopped_at != null) return null;
        const appended = await ctx.fns.session.appendUserMessage({ id, text, eventExtra: {
            automationKind: "scheduled", ...(opts.scheduleId ? { scheduleId: opts.scheduleId } : {}),
        } });
        const now = Date.now();
        await ctx.fns.procs.db.run({
            sql: "UPDATE agents SET next_run_at=COALESCE(next_run_at,?),updated_at=? WHERE id=? AND archived_at IS NULL", params: [now, now, id],
        });
        return appended;
    } }) as { idx: number } | null;
    if (!message) return { agentId: id, messageIdx: null, scheduled: false, reason: "stopped" };
    const live=(ctx.state as any).agent?.[id];if(live)await ctx.fns.session.syncAgentState({agent:live});
    ctx.fns.events.refreshAgentMeta({agentId:id,section:"automation",reason:"scheduled-prompt"});ctx.fns.agent.wakeWorker({});return{agentId:id,messageIdx:message.idx,scheduled:true};
}
