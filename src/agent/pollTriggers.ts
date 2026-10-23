/**
 * Claims and starts processing due durable agent triggers
 *
 * Atomically claim due time, cron and condition triggers for non-stopped, non-archived agents with PostgreSQL SKIP LOCKED. Preserve paused schedules, recover abandoned claims, and evaluate claims asynchronously from the main worker loop.
 * @param opts.now Claim timestamp; defaults to now.
 * @param opts.limit Maximum claims per pass. @default 10 @minimum 1 @maximum 50
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Claim timestamp; defaults to now. */
        now?: number;
        /** Maximum claims per pass. @default 10 @minimum 1 @maximum 50 */
        limit?: number;
    },
): Promise<{ processed: string[] }> {
    const now=Math.floor(opts?.now??Date.now()),limit=Math.max(1,Math.min(50,opts?.limit??10));await ctx.fns.procs.db.run({sql:"UPDATE agent_triggers SET status='active',claim_token=NULL,claimed_at=NULL,next_at=COALESCE(next_at,?),last_error='recovered stale claim',updated_at=? WHERE status='checking' AND claimed_at<?",params:[now,now,now-10*60000]});const rows=await ctx.fns.procs.db.select({sql:`WITH due AS (SELECT tr.id FROM agent_triggers tr JOIN agents a ON a.id=tr.agent_id WHERE tr.status='active' AND tr.next_at IS NOT NULL AND tr.next_at<=? AND a.stopped_at IS NULL AND a.archived_at IS NULL ORDER BY tr.next_at,tr.id LIMIT ? FOR UPDATE OF tr SKIP LOCKED) UPDATE agent_triggers t SET status='checking',claim_token=('tc_'||gen_random_uuid()::text),claimed_at=?,updated_at=? FROM due WHERE t.id=due.id RETURNING t.id,t.claim_token`,params:[now,limit,now,now]}) as any[];for(const row of rows)void ctx.fns.agent.processTrigger({triggerId:String(row.id),claimToken:String(row.claim_token),now}).catch((e:any)=>console.error(`trigger ${row.id} failed:`,e));return{processed:rows.map(r=>String(r.id))};
}
