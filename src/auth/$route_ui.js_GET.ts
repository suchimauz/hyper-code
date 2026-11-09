/** Serve only the fixed public React sign-in script; never proxy Vite or filesystem paths. */
export default async function (ctx: Context, _session: Session | null, _opts?: {}): Promise<Response> {
    return ctx.fns.auth.reactAsset({ kind: 'js' });
}
