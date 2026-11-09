/**
 * Reject the retired generic browser RPC endpoint without resolving runtime functions.
 * Use native capability-specific HTTP endpoints instead.
 * @param opts.req Incoming request; its body is never read or dispatched.
 */
export default function (_ctx: Context, _session: Session | null, opts: {
    /** Incoming request; its body is never read or dispatched. */ req: Request;
}): Response {
    return Response.json({ error: 'Generic RPC retired. Use capability-specific endpoints.' }, { status: 410, headers: { 'cache-control': 'no-store' } });
}
