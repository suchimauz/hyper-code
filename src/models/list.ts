/**
 * List stored model connections without secret values
 *
 * Use for settings screens and connection pickers. Returns every connection (enabled or not, including ones whose provider is no longer registered) in creation order, optionally filtered by provider. Secret fields are reported only as set/not set.
 * @param opts.provider Only connections of this provider id.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Only connections of this provider id. */
        provider?: string;
    },
): Promise<types.models.ConnectionView[]> {
    const rows = opts.provider === undefined
        ? await ctx.fns.procs.db.select({ sql: "SELECT * FROM llm_connections ORDER BY created_at, id", params: [] })
        : await ctx.fns.procs.db.select({ sql: "SELECT * FROM llm_connections WHERE provider=? ORDER BY created_at, id", params: [String(opts.provider)] });
    return rows.map(row => ctx.fns.models.toView({ row }));
}
