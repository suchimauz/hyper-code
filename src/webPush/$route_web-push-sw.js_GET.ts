/** Serve the static push-only worker at root scope, without any authenticated content or offline cache. */
export default async function (ctx: Context, _session: Session | null, _opts: {
    /** Incoming worker request. */ req: Request;
    /** Route parameters. */ params: Record<string, string>;
}): Promise<Response> {
    return new Response(await ctx.fns.webPush.workerSource({}), { headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/',
        'X-Content-Type-Options': 'nosniff',
    } });
}
