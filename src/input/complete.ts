/**
 * Atomically finish an input and deliver its single terminal result without bypassing agent scheduling gates
 *
 * Server lifecycle completion for authenticated plugin handlers after their own session, CSRF and exact-action checks. Protected kinds require the current registered completionAuthority object by identity; this is a dispatch fence, not a sandbox. Hot reload replaces authority: resolve it from the current registered kind at completion time. Joins an active framework transaction; its caller must refresh and wake after commit. Never authorizes an external action. Expiry may only finish open rows with a due server deadline.
 * @param opts.id Existing input identifier.
 * @param opts.state Terminal lifecycle state.
 * @param opts.summary Plain-text outcome delivered to the agent.
 * @param opts.result Safe JSON result, never a secret value.
 * @param opts.actor Authenticated actor identifier, or server expiry actor.
 * @param opts.authority Current protected kind completion authority; server-only, never serialize.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Existing input identifier. */
        id: string;
        /** Terminal lifecycle state. */
        state: "submitted" | "cancelled" | "expired";
        /** Plain-text outcome delivered to the agent. */
        summary: string;
        /** Safe JSON result, never a secret value. */
        result?: Record<string, unknown> | null;
        /** Authenticated actor identifier, or server expiry actor. */
        actor?: string | null;
        /** Current protected kind completion authority; server-only, never serialize. */
        authority?: object;
    },
): Promise<{ state: string; completed: boolean; scheduled: boolean }> {
    const existing = await ctx.fns.input.get({id:opts.id});
    if (!existing) throw new Error('Unknown input');
    const kind = (ctx.state as any).input?.kinds?.[existing.kind] as types.input.Registered | undefined;
    if (opts.state !== 'expired' && kind?.completionAuthority && opts.authority !== kind.completionAuthority) throw new Error('Protected input requires its authoritative handler');
    if (opts.state !== 'expired' && !kind?.completionAuthority) throw new Error('Use input.submit for ordinary input results');
    const persist = async () => {
     await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id=? FOR UPDATE',params:[existing.agentId]});
     const now=Date.now();
     const claimed=await ctx.fns.procs.db.run({sql: opts.state === 'expired'
     ? "UPDATE inputs SET state=?,result=?::jsonb,answered_by=?,updated_at=? WHERE id=? AND state='open' AND (CASE WHEN spec->>'_expiresAt' ~ '^[0-9]{1,16}$' THEN (spec->>'_expiresAt')::bigint END) <= ? RETURNING id"
     : "UPDATE inputs SET state=?,result=?::jsonb,answered_by=?,updated_at=? WHERE id=? AND state IN ('open','processing') RETURNING id",
     params:[opts.state,JSON.stringify(opts.result ?? null),opts.actor ?? null,now,opts.id,...(opts.state==='expired'?[now]:[])]});
     if (!claimed.rows.length) return {state:(await ctx.fns.input.get({id:opts.id}))!.state,completed:false,scheduled:false};
     const esc=(v:string)=>v.replace(/[&"<>]/g,c=>({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[c]!));
     await ctx.fns.session.appendMessage({id:existing.agentId,ts:now,message:{role:'user',message_type:'input',content:'<input-result id="'+esc(opts.id)+'" kind="'+esc(existing.kind)+'" state="'+opts.state+'">\n'+opts.summary+(opts.result?'\n'+JSON.stringify(opts.result):'')+'\n</input-result>'}});
     const scheduled = await ctx.fns.procs.db.run({sql:"UPDATE agents SET next_run_at=GREATEST(COALESCE(next_run_at,0),?),updated_at=? WHERE id=? AND archived_at IS NULL AND stopped_at IS NULL AND NOT EXISTS (SELECT 1 FROM inputs i WHERE i.agent_id=agents.id AND i.spec->>'_agentWait'='true' AND i.state IN ('open','processing')) AND NOT (COALESCE(scratchpad::jsonb,'{}'::jsonb)->'plan'->>'pausedAt' IS NOT NULL) RETURNING id",params:[now,now,existing.agentId]});
     return {state:opts.state,completed:true,scheduled:scheduled.rows.length > 0};
    };
    const ambient=(ctx.state as any).procs?.db?.transactionStorage?.getStore();
    if(ambient?.active) return await persist();
    const out=await ctx.fns.procs.db.transaction({fn:persist});
    // The owner handled this request here: withdraw the notification from their other devices.
    await ctx.fns.webPush?.recall?.({inputId:opts.id}).catch(()=>undefined);
    const live=(ctx.state as any).agent?.[existing.agentId];
    if(live) await ctx.fns.session.syncAgentState({agent:live});
    ctx.fns.procs.events.refresh({topic:'agent:'+existing.agentId,reason:'input'});
    ctx.fns.agent.wakeWorker({});
    return out as { state: string; completed: boolean; scheduled: boolean };
}
