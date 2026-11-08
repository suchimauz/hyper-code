/** Handles the HTTP route control.js GET endpoint. */
export default async function (ctx: Context, _session: Session | null, opts: {
        /** Incoming HTTP request. */ req: Request;
        /** Route parameters captured from the request path. */ params: Record<string, string> }) {
    // Generated per request, so revalidated every load; an unchanged script answers 304 instead of the body.
    const body = await ctx.fns.ui.controlScript({});
    const etag = `"${Bun.hash(body).toString(36)}"`;
    const headers = { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache', etag };
    if (opts?.req?.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
    return new Response(body, { headers });
}
