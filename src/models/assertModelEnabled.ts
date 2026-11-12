/**
 * Reject inference for a disabled model or disabled model connection
 *
 * Gate called by models.stream and models.compact before any provider code runs. Reads the stored connection on every call without caching, so a session already using a model fails on its very next request after the owner disables it. Throws `Model <model> is disabled by user` with code MODEL_DISABLED_BY_USER, retryable:false, replaySafe:false; a disabled connection throws code CONNECTION_DISABLED; unknown connections throw NOT_FOUND.
 * @param opts.id Connection UUID.
 * @param opts.model Provider-native model id requested for inference.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Provider-native model id requested for inference. */
        model: string;
    },
): Promise<types.models.ConnectionView> {
    const view = await ctx.fns.models.get({ id: opts.id });
        const model = String(opts.model ?? "");
        if (!view.enabled) throw Object.assign(new Error("Connection " + view.accountName + " is disabled"), { code: "CONNECTION_DISABLED", status: 409, retryable: false, replaySafe: false });
        if (view.disabledModels.includes(model)) throw Object.assign(new Error("Model " + model + " is disabled by user"), { code: "MODEL_DISABLED_BY_USER", status: 409, retryable: false, replaySafe: false });
        return view;
}
