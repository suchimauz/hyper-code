/** Close the frontend listener and HMR watchers when MauzCode shuts down. */
export default async function (ctx: Context, _session: Session | null, _state?: object) {
    await ctx.fns.frontendRuntime.stop({});
}
