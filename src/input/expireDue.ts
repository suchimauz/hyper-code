/**
 * Expire due open input deadlines durably without requiring an open browser
 *
 * Worker housekeeping scans bounded due open inputs. Processing external approvals are never expired or automatically recovered: their owning plugin must reconcile external receipts after a crash. Worker housekeeping runs on wake and at most every 30 seconds while idle. Each completion uses the common transactional terminal result path and respects remaining gates, stop and archive.
 * @param opts.limit Maximum due rows processed in one worker pass. @default 100 @minimum 1 @maximum 500
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Maximum due rows processed in one worker pass. @default 100 @minimum 1 @maximum 500 */
        limit?: number;
    },
): Promise<{ expired: number }> {
    const limit=Math.min(500,Math.max(1,Math.trunc(opts.limit ?? 100)));
    const rows=await ctx.fns.procs.db.select({sql:"SELECT id FROM inputs WHERE state='open' AND (CASE WHEN spec->>'_expiresAt' ~ '^[0-9]{1,16}$' THEN (spec->>'_expiresAt')::bigint END) <= ? ORDER BY (CASE WHEN spec->>'_expiresAt' ~ '^[0-9]{1,16}$' THEN (spec->>'_expiresAt')::bigint END) LIMIT ?",params:[Date.now(),limit]});
    let expired=0;
    for(const row of rows){ const out=await ctx.fns.input.complete({id:row.id,state:'expired',summary:'Input expired before an answer was received',actor:'system:expiry'}); if(out.completed) expired++; }
    return {expired};
}
