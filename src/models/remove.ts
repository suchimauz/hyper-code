/**
 * Remove a model connection and delete every secret it owns
 *
 * Use when the owner deletes a connection. Deletes the row and all `secret://models/<id>.*` entries in one transaction and drops its cached health. Throws `NOT_FOUND` for unknown ids. Existing LLM routes, accounts and agents are not affected.
 * @param opts.id Connection UUID.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
    },
): Promise<{ removed: string }> {
    const { id } = await ctx.fns.models.get({ id: opts.id });
    await ctx.fns.procs.db.transaction({ fn: async () => {
        const rows = await ctx.fns.procs.db.select({ sql: "DELETE FROM llm_connections WHERE id=? RETURNING secrets", params: [id] });
        if (!rows[0]) throw Object.assign(new Error("Connection not found"), { code: "NOT_FOUND", status: 404 });
        const refs: Record<string, string> = typeof rows[0].secrets === "string" ? JSON.parse(rows[0].secrets) : (rows[0].secrets ?? {});
        for (const key of Object.keys(refs)) await ctx.fns.secrets.deleteLocal({ namespace: "models", name: `${id}.${key}` });
        // Also catch secrets of fields no longer referenced (e.g. a provider schema change).
        await ctx.fns.procs.db.run({ sql: "DELETE FROM local_secrets WHERE namespace='models' AND starts_with(name, ?)", params: [`${id}.`] });
    } });
    const health = ctx.state.models?.health;
    if (health) for (const key of Object.keys(health)) if (key.startsWith(`${id}:`)) delete health[key];
    return { removed: id };
}
