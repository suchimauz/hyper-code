/**
 * Stop an owned worker run at the context guard while preserving plan pause semantics.
 *
 * Internal context-boundary guard, never manual cancellation. Locks the owned row and
 * commits the paused plan and terminal state together, preserving concurrent queued
 * user work. Captured controllers cannot cancel a replacement run. Only an unchanged,
 * unscheduled terminal state qualifies for error push delivery.
 * @param opts.agent Live agent reaching its context guard.
 * @param opts.runToken Token still owned by this worker run.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Live agent reaching its context guard. */
    agent: types.agent.Agent;
    /** Token still owned by this worker run. */
    runToken: string;
}): Promise<boolean> {
    const {agent,runToken}=opts;
    const controller=agent.abortController;
    const sampling=agent.samplingAbortController;
    const owns=()=>agent.currentJobId===runToken && agent.abortController===controller && !controller?.signal.aborted;
    if (!owns()) return false;
    const finalized=await ctx.fns.procs.db.transaction({fn:async()=>{
        const rows=await ctx.fns.procs.db.select({sql:"SELECT scratchpad FROM agents WHERE id=? AND run_token=? AND run_state='running' FOR UPDATE",params:[agent.id,runToken]});
        if (!rows.length || !owns()) return null;
        const now=Date.now();
        const scratchpad=JSON.parse(String(rows[0].scratchpad || '{}'));
        const plan=scratchpad.plan;
        if (plan && !plan.pausedAt) {
            const task=Array.isArray(plan.tasks)?plan.tasks.find((t: {status?:string})=>t.status==='active'):null;
            if (task?.activeSince) {
                task.elapsedMs=Math.max(0,Number(task.elapsedMs??0))+Math.max(0,now-Number(task.activeSince));
                task.activeSince=null;
            }
            plan.pausedAt=now;
            plan.updatedAt=now;
        }
        const updated=await ctx.fns.procs.db.select({sql:"UPDATE agents SET scratchpad=?,run_state='idle',run_started_at=NULL,run_heartbeat_at=NULL,run_token=NULL,last_error='context limit guard stopped work',updated_at=? WHERE id=? AND run_token=? AND run_state='running' RETURNING id",params:[JSON.stringify(scratchpad),now,agent.id,runToken]});
        return updated.length ? {now,scratchpad} : null;
    }}) as {now:number;scratchpad:types.agent.Agent['scratchpad']} | null;
    if (!finalized) return false;
    // Abort only captured objects, never whichever controllers are installed later.
    sampling?.abort('context_guard');
    controller?.abort('context_guard');
    if (agent.currentJobId===runToken && agent.abortController===controller) {
        agent.scratchpad=finalized.scratchpad;
        if (agent.samplingAbortController===sampling) agent.samplingAbortController=null;
        agent.abortController=null;
        agent.isStreaming=false;
    }
    ctx.fns.events?.refreshAgentMeta?.({agentId:agent.id,reason:'context-guard-paused'});
    await ctx.fns.webPush.recordFailure({agentId:agent.id,runToken,finalizedAt:finalized.now});
    return true;
}
