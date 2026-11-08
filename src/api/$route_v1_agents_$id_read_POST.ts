/**
 * Marks an agent read through an optional JSON {throughTs:number} loaded-event boundary.
 * Empty bodies retain legacy read-through-latest behavior. Invalid boundaries return HTTP 400.
 * @param opts.req HTTP request with an optional JSON receipt body.
 * @param opts.params Route parameters containing the agent id.
 */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    let throughTs: number | undefined;
    const body = await opts.req.text();
    if (body.trim()) {
        try {
            const receipt = JSON.parse(body);
            if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
                || typeof receipt.throughTs !== 'number' || !Number.isFinite(receipt.throughTs) || receipt.throughTs < 0) {
                throw new TypeError('Invalid receipt');
            }
            throughTs = receipt.throughTs;
        } catch {
            return Response.json({ error: 'invalid_request', message: 'Expected JSON {throughTs: finite non-negative number}' }, { status: 400 });
        }
    }
    const id = opts.params.id!;
    const row = ((await ctx.fns.procs.db.select({
        sql: "SELECT MAX(ts) AS ts FROM events WHERE agent_id = ?",
        params: [id],
    })) as any[])[0];
    if (row?.ts == null) {
        const exists = ((await ctx.fns.procs.db.select({ sql: "SELECT 1 FROM agents WHERE id = ?", params: [id] })) as any[])[0];
        if (!exists) return Response.json({ error: "not_found", message: "Agent not found" }, { status: 404 });
    }
    const seenAt = await ctx.fns.auth.markSeen({ agentId: id, throughTs });
    return Response.json({ version: 1, ok: true, agentId: id, seenAt });
}
