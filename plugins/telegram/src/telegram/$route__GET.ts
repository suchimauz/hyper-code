/** Redirect the former Telegram HTML client to its host-reviewed native React page. */
export default async function (_ctx: Context, _session: Session | null, _opts: {
    /** Incoming authorized HTTP request. */
    req: Request;
    /** Route parameters (unused for this static entry point). */
    params: Record<string, string>;
}): Promise<Response> {
    return new Response(null, { status: 302, headers: { Location: "/?view=extension:telegram/overview" } });
}
