/** Serve only the fixed public React sign-in stylesheet. */
export default async function (ctx: Context, _session: Session | null, _opts?: {}): Promise<Response> {
    return ctx.fns.auth.reactAsset({ kind: 'css' });
}
