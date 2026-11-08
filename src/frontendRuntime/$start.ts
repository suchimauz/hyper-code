/** Start the shared frontend Vite server before Hyper opens its HTTP listener. */
export default async function (ctx: Context, _session: Session | null, _opts?: {}) {
    await ctx.fns.frontendRuntime.start({});
}
