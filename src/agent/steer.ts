/**
 * Send a durable team update from a delegated child to its parent
 *
 * Persists a structured progress, completion, blocked, or failure notification in the parent transcript and refreshes both Meta panels. Schedules the parent unless explicitly stopped or its plan is paused; stopped parents retain updates for their next explicit run. Use internally when a delegated child changes meaningful task state.
 * @param opts.from Delegated child agent sending the update; its parentId determines the recipient.
 * @param opts.event Team lifecycle event represented by the update.
 * @param opts.summary Short parent-facing description of completed work or a problem.
 * @param opts.taskId Stable child plan task identifier when the event concerns one task.
 * @param opts.taskTitle Human-readable child plan task title when available.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Delegated child agent sending the update; its parentId determines the recipient. */
        from: types.agent.Agent;
        /** Team lifecycle event represented by the update. */
        event: "task.completed" | "plan.completed" | "answer" | "blocked" | "failed";
        /** Short parent-facing description of completed work or a problem. */
        summary: string;
        /** Stable child plan task identifier when the event concerns one task. */
        taskId?: string;
        /** Human-readable child plan task title when available. */
        taskTitle?: string;
    },
): Promise<{ delivered: boolean; queued?: boolean; parentId: string | null; messageIdx?: number }> {
    const child = opts.from;
    const parentId = child.parentId ? String(child.parentId) : null;
    if (!parentId) return { delivered: false, parentId: null };
    const summary = String(opts.summary ?? "").trim().slice(0, 4000);
    if (!summary) throw new Error("steer: summary is required");
    const taskTitle = opts.taskTitle ? String(opts.taskTitle) : null;
    const content = '<team-update member="' + child.id + '" event="' + opts.event + '">Agent ' + child.id + ' ' + opts.event + (taskTitle ? ' task "' + taskTitle + '"' : '') + '. ' + summary + '</team-update>';
    const completion = child.scratchpad?.delegation?.result ?? child.scratchpad?.delegateTask?.result;
    const key = opts.event === 'plan.completed' && completion?.finishedAt
        ? `completion:${child.id}:${completion.finishedAt}` : crypto.randomUUID();
    const message = await ctx.fns.session.deliverInbound({ id: parentId, delivery: {
        key, text: content, author: 'agent:' + child.id, messageType: 'team_update', wake: true,
        event: { type: 'team_update', event: opts.event, memberId: child.id, taskId: opts.taskId ?? null, taskTitle, summary },
    } });
    if (opts.event === "blocked" || opts.event === "failed") {
        child.scratchpad ??= {};
        const meta = child.scratchpad.delegation;
        if (meta && typeof meta === "object") {
            meta.status = opts.event;
            meta.summary = summary;
            await ctx.fns.session.updateScratchpad({ id: child.id, scratchpad: child.scratchpad });
        }
    }
    ctx.fns.events.refreshAgentMeta({ agentId: parentId, section: "team", reason: "team-update" });
    ctx.fns.events.refreshAgentMeta({ agentId: child.id, section: "plan", reason: "team-update" });
    return { delivered: !message.queued, queued: message.queued, parentId, ...(message.messageIdx == null ? {} : { messageIdx: message.messageIdx }) };
}
