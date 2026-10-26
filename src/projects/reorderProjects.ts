/**
 * Persist the viewer’s exact ordering of visible non-archived projects
 *
 * Use after rearranging the personal project sidebar. Requires an authorized project principal and an exact permutation of current non-archived project IDs, including virtual projects. Preserves archived project slots without materializing projects; concurrent reorders use last-write-wins semantics.
 * @param opts.projectIds Every currently visible non-archived project ID exactly once, in the desired order. Empty only when no active projects exist.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Every currently visible non-archived project ID exactly once, in the desired order. Empty only when no active projects exist. */
        projectIds: string[];
    },
): Promise<string[]> {
    const principal = await ctx.fns.projects.principal({});
    const projects = await ctx.fns.projects.list({});
    const active = projects.filter(project => !project.archived);
    const ids = opts.projectIds;
    const visible = new Set(active.map(project => project.id));
    if (!Array.isArray(ids) || ids.length !== active.length || new Set(ids).size !== active.length || ids.some(id => typeof id !== 'string' || !visible.has(id))) {
        throw new Error('Order must contain every visible non-archived project exactly once');
    }
    // Keep archived projects in their existing slots, so restoring them preserves their position.
    let next = 0;
    const order = projects.map(project => project.archived ? project.id : ids[next++]!);
    await ctx.fns.procs.db.run({
        sql: 'INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value',
        params: ['project-order:' + principal, JSON.stringify(order)],
    });
    ctx.fns.procs.events.emit({topic:'projects',event:{type:'projects.changed'}});
    return [...ids];
}
