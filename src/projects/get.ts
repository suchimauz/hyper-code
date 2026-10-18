/**
 * Read a project by its opaque ID without materializing it.
 *
 * Returns null for unknown projects; includes read-only discovered projects.
 * @param opts.projectId Opaque project ID returned by list.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Opaque project ID returned by list. */
        projectId: string;
    },
): Promise<types.projects.Project | null> {
    return (await ctx.fns.projects.list({})).find(p=>p.id===opts.projectId) ?? null;
}
