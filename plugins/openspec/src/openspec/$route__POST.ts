/** Open an OpenSpec Canvas tab for the authorized agent after CSRF verification. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Browser request identifying the agent and carrying the cookie-bound CSRF token. */
    req: Request;
}): Promise<Response> {
    return ctx.fns.openspec.handle({ req: opts.req });
}
