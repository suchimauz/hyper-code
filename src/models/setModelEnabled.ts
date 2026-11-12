/**
 * Disable or re-enable one model id on a model connection
 *
 * Owner operation behind the Models tab model switches. Atomically adds or removes the model id in the connection's disabled set (idempotent), bumps updatedAt and emits the llm-models refresh topic. Disabled models stay listed but models.stream and models.compact refuse them. Does not touch legacy llm.modelPolicy routes. Fails with VALIDATION for an empty, whitespace-containing or over-200-character model id and NOT_FOUND for an unknown connection.
 * @param opts.id Connection UUID.
 * @param opts.model Provider-native model id, 1–200 characters without whitespace.
 * @param opts.enabled True re-enables the model, false disables it.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Provider-native model id, 1–200 characters without whitespace. */
        model: string;
        /** True re-enables the model, false disables it. */
        enabled: boolean;
    },
): Promise<types.models.ConnectionView> {
    const model = typeof opts.model === "string" ? opts.model : "";
        if (!/^\S{1,200}$/.test(model)) throw Object.assign(new Error("Model id must be 1–200 characters without whitespace"), { code: "VALIDATION", field: "model", status: 400 });
        if (typeof opts.enabled !== "boolean") throw Object.assign(new Error("enabled must be true or false"), { code: "VALIDATION", field: "enabled", status: 400 });
        const view = await ctx.fns.models.get({ id: opts.id });
        const sql = opts.enabled
            ? "UPDATE llm_connections SET disabled_models = array_remove(disabled_models, ?), updated_at = ? WHERE id = ?"
            : "UPDATE llm_connections SET disabled_models = CASE WHEN ? = ANY(disabled_models) THEN disabled_models ELSE array_append(disabled_models, ?) END, updated_at = ? WHERE id = ?";
        const now = Math.max(Date.now(), view.updatedAt + 1);
        await ctx.fns.procs.db.run({ sql, params: opts.enabled ? [model, now, view.id] : [model, model, now, view.id] });
        try { await ctx.fns.procs.events.refresh({ topic: "llm-models", reason: "models-model-enabled" }); } catch (error) { ctx.fns.procs.log.debug({ event: "models.refresh", msg: String(error) }); }
        return ctx.fns.models.get({ id: view.id });
}
