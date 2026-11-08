// Global / middleware runs first; this prefix never bypasses authentication.
export default async function(ctx: Context, _session: Session | null, opts: {req: Request}) {
    return await ctx.fns.frontendBridge.proxy({req: opts.req});
}
