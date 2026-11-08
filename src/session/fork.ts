/** Create a child inheriting its parent's transcript and result references. Clone durable scratchpad state and plans, but omit obsolete result bodies and their sequence counter. */
export default async function (ctx: Context, _session: Session | null, opts: {
        /** Agent identifier. */
id: string;
        /** Human-readable title. */
title?: string;
        /** Number of parent messages inherited by the child. */
offset?: number;
        /** Child listing policy. User-created forks normally keep the default nav. @default nav */
visibility?: "nav" | "team" | "hidden";
        /** Trusted manual caller policy; internal forks never inherit goals by default. Snapshot requires nav visibility. @default none */
goalMode?: 'none' | 'snapshot';
        /** Internal caller-transaction mode: return persisted child without state/events; caller publishes after commit. Incompatible with snapshot. Requires active framework transaction. @default false */
deferPublication?: boolean }): Promise<types.agent.Agent> {
    const { id } = opts;
    const mode = opts.goalMode ?? 'none';
    if (opts.deferPublication && (mode === 'snapshot' || !(ctx.state.procs as any)?.db?.transactionStorage?.getStore()?.active)) throw new Error('Deferred fork requires an active caller transaction and goalMode none');
    if (mode !== 'none' && mode !== 'snapshot') throw new Error('Invalid fork goal mode');
    if (mode === 'snapshot' && opts.visibility && opts.visibility !== 'nav') throw new Error('Goal snapshot requires nav visibility');
    const retry = (reason: string): never => { throw Object.assign(new Error(`Goal snapshot retry: ${reason}`), {code:'GOAL_FORK_RETRY'}); };
    let prepared: {goalId:string;revision:number;runState:string;runToken:string|null} | undefined;
    if (mode === 'snapshot' && await ctx.fns.goal.enabled({})) {
        const owner = (await ctx.fns.procs.db.select({sql:'SELECT run_state,run_token FROM agents WHERE id=?',params:[id]}))[0];
        const initial = await ctx.fns.goal.read({agentId:id});
        if (!owner || !initial.enabled) retry('source unavailable');
        if (initial.enabled && initial.goal) {
            const goalId = initial.goal.goalId;
            if (owner.run_state === 'running') {
                if (!owner.run_token) retry('missing worker token');
                const state = await ctx.fns.goal.runStopRegistry({action:'get',agentId:id,runToken:String(owner.run_token)});
                if (!state || state.sealed || state.binding.rootAgentId !== id || state.binding.sourceAgentId !== id || state.binding.goalId !== goalId || state.binding.runToken !== owner.run_token) retry('missing exact live accounting');
                if (initial.goal.status !== 'active') retry('running inactive goal');
                const flushed = await ctx.fns.goal.runCheckpointFlush({state:state!});
                if (flushed.kind !== 'committed' || state!.sealed || state!.pendingRequests.size || state!.blocked) retry('accounting not exact or pending');
            } else if (owner.run_state !== 'idle') retry('source lease transitioning');
            const current = await ctx.fns.goal.read({agentId:id});
            if (!current.enabled || !current.goal || current.goal.goalId !== goalId) retry('goal changed during flush');
            if (current.enabled && current.goal) prepared = {goalId,revision:current.goal.revision,runState:String(owner.run_state),runToken:owner.run_token == null ? null : String(owner.run_token)};
        }
    }
    const parent = (ctx.state as any).agent?.[id] ?? (await ctx.fns.session.load({ id }));
    if (!parent) throw new Error(`agent not found: ${id}`);
    const fullCount = (await ctx.fns.session.getFullMessages({ id })).length;
    const create = async () => {
    const agent = await ctx.fns.agent.start({
        model: parent.model,
        systemPrompt: parent.systemPrompt,
        tools: parent.tools,
        title: opts.title ?? (parent.title ? `${parent.title} (fork)` : ""),
        workspaceDir: parent.workspaceDir,
        workspaceHost: parent.workspaceHost,
        parentId: parent.id,
        visibility: opts.visibility ?? "nav",
        forkOffset: opts.offset ?? fullCount,
        ...(prepared || opts.deferPublication ? {deferPublication:true} : {}),
    });
    // Omit obsolete result bodies before cloning, while preserving plans and other durable state.
    const { results: _legacyResults, resultSeq: _legacyResultSeq, ...durableScratchpad } = parent.scratchpad ?? {};
    agent.scratchpad = JSON.parse(JSON.stringify(durableScratchpad));
    await ctx.fns.session.save({ agent });
    await ctx.fns.planning.inherit({ sourceId: id, targetId: agent.id });
    if (prepared) {
        const snapshot = await ctx.fns.goal.forkSnapshot({sourceAgentId:id,targetAgentId:agent.id,expectedGoalId:prepared.goalId,expectedRevision:prepared.revision,expectedSourceRunState:prepared.runState,expectedSourceRunToken:prepared.runToken,transactionMode:'caller'});
        if (!snapshot.copied) retry(snapshot.reason);
    }
    return agent;
    };
    const agent = prepared ? await ctx.fns.procs.db.transaction({fn:create}) as types.agent.Agent : await create();
    if (prepared) {
        (ctx.state as any).agent ??= {};
        (ctx.state as any).agent[agent.id] = agent;
        // Commit already succeeded: notification failures must never invite duplicate retries.
        for (const reason of ['create','fork']) {
            try { await ctx.fns.events.emitAgentsChanged({agentId:agent.id,reason}); }
            catch (error) { console.error('Committed fork notification failed',agent.id,reason,error); }
        }
    } else if (!opts.deferPublication) await ctx.fns.events.emitAgentsChanged({agentId:agent.id,reason:'fork'});
    return agent;
}
