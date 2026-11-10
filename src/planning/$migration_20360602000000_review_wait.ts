/** Upgrade current open exact-plan reviews to the common durable input wait gate. */
export default { async up(ctx: Context) {
    await ctx.fns.procs.db.run({sql:`UPDATE inputs i SET spec=jsonb_set(COALESCE(i.spec,'{}'::jsonb),'{_agentWait}','true'::jsonb),updated_at=?
        FROM agent_planning p WHERE p.agent_id=i.agent_id AND p.mode='plan'
        AND p.proposal->>'status'='pending' AND p.proposal->>'inputId'=i.id
        AND i.kind='planning-review' AND i.state IN ('open','processing')
        AND (i.spec->>'_agentWait') IS DISTINCT FROM 'true'`,params:[Date.now()]});
} };
