/**
 * Serve an approved plugin UI bundle (/plugins/ui/<name>/<hash>.js) or a host runtime shim (/plugins/ui/runtime/<module>.js).
 * @param opts.req Authenticated browser module request.
 * @param opts.params Plugin name (or runtime) and file name.
 */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Authenticated browser module request. */ req: Request;
    /** Plugin name (or runtime) and file name. */ params: Record<string, string>;
}): Promise<Response> {
    if (!(session as Session & { user?: object })?.user) return new Response('Unauthorized', { status: 401 });
    const name = opts.params.name ?? '', file = opts.params.file ?? '';
    const js = { 'Content-Type': 'text/javascript; charset=utf-8', 'X-Content-Type-Options': 'nosniff' };
    if (name === 'runtime') {
        const shim = /^[a-z-]+\.js$/.test(file) ? await ctx.fns.plugins.uiRuntimeShim({ module: file.slice(0, -3) }) : null;
        return shim ? new Response(shim, { headers: { ...js, 'Cache-Control': 'no-cache' } }) : new Response('Not found', { status: 404 });
    }
    const match = /^([0-9a-f]{16})\.js$/.exec(file);
    if (!match) return new Response('Not found', { status: 404 });
    const manifest = await ctx.fns.plugins.uiManifest({});
    const entry = manifest.plugins.find(p => p.name === name && p.hash === match[1]);
    const code = entry ? (ctx.state as { plugins?: types.plugins.State }).plugins?.ui?.[name]?.code : null;
    if (!entry || !code) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return new Response(code, { headers: { ...js, 'Cache-Control': 'private, max-age=31536000, immutable' } });
}
