/** Redirect legacy creation links to the native NewSession flow without creating an agent.
 * @param opts.req Incoming request; creation defaults remain in its query string.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming request with optional project and model defaults. */ req: Request;
}): Promise<Response> {
    const query = new URL(opts.req.url).searchParams;
    const projectId = query.get('projectId');
    if (projectId && !await ctx.fns.projects.get({ projectId })) return new Response('Project not found', { status: 404 });
    query.delete('popup'); query.delete('agent'); query.delete('page'); query.set('newSession', '1');
    return new Response(null, { status: 303, headers: { location: `/?${query}`, 'cache-control': 'no-store' } });
}
