/**
 * Redirect legacy agent page links to the React application without rendering a second shell.
 * Existing authentication and ownership checks run in the HTTP access layer.
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters containing the agent identifier.
 */
export default function (_ctx: Context, _session: Session | null, opts: {
    /** Incoming HTTP request. */ req: Request;
    /** Route parameters containing the agent identifier. */ params: Record<string, string>;
}): Response {
    const id = opts.params.id;
    if (!id || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return new Response("Not Found", { status: 404 });
    return new Response(null, { status: 303, headers: { location: `/?agent=${encodeURIComponent(id)}` } });
}
