/** Open the existing model-and-instructions creation popup without creating an agent; optionally bind it to a visible project. */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Visible project identifier to preselect; omitted keeps the ordinary workspace picker. */
    projectId?: string;
}): Promise<Response> {
    const url = new URL(session?.req?.url ?? 'http://localhost/');
    url.pathname = '/agent/new';
    url.search = '?popup=1';
    if (opts.projectId) url.searchParams.set('projectId', opts.projectId);
    const req = new Request(url.toString(), { headers: session?.req?.headers });
    const route = (ctx.state.procs.http.routes as any)?.['/agent/new']?.GET;
    if (typeof route !== 'function') return new Response('new agent popup unavailable', { status: 404 });
    const value = await route(ctx, session, { req, params: {} });
    return value instanceof Response ? value : new Response(String(value), { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
