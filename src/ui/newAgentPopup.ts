/** Redirect legacy popup triggers to native NewSession without creating or sending anything.
 * @param opts.projectId Visible project to preselect in the native creation draft.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Visible project identifier to preselect. */ projectId?: string;
}): Promise<Response> {
    if (opts.projectId && !await ctx.fns.projects.get({ projectId: opts.projectId })) return new Response('Project not found', { status: 404 });
    const query = new URLSearchParams({ newSession: '1' });
    if (opts.projectId) query.set('projectId', opts.projectId);
    return new Response(null, { status: 204, headers: { 'HX-Redirect': `/?${query}`, 'cache-control': 'no-store' } });
}
