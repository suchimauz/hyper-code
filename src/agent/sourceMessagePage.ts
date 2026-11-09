/** Read one persisted provenance message for the native source reader. Missing sources return 404.
 * @param opts.id Durable source agent identifier.
 * @param opts.idx Durable source message index. @minimum 0
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Durable source agent identifier. */ id: string;
    /** Durable source message index. @minimum 0 */ idx: number;
}): Promise<Response> {
    if (!Number.isSafeInteger(opts.idx) || opts.idx < 0) return new Response('Not Found', { status: 404 });
    const rows = await ctx.fns.procs.db.select({ sql: 'SELECT role, content FROM messages WHERE agent_id = ? AND idx = ?', params: [opts.id, opts.idx] });
    const row = rows[0];
    if (!row) return new Response('Source message no longer available', { status: 404 });
    return Response.json({ agentId: opts.id, index: opts.idx, role: String(row.role), content: String(row.content ?? '') }, { headers: { 'cache-control': 'no-store' } });
}
