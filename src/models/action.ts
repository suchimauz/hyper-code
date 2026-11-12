/**
 * Invoke a provider-declared action such as login or logout on one connection
 *
 * Use for provider-owned flows; the core implements no provider-specific authorization. Fails with `UNKNOWN_ACTION` (nothing called) when the provider did not declare the action. Disabled connections are refused. The result must be JSON-compatible; any of the connection's secret values or secret:// references found in it cause the result to be withheld.
 * @param opts.id Connection UUID.
 * @param opts.action Declared action name.
 * @param opts.input JSON-compatible action input. @default null
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Declared action name. */
        action: string;
        /** JSON-compatible action input. @default null */
        input?: types.models.ActionValue;
    },
): Promise<types.models.ActionValue> {
    const view = await ctx.fns.models.get({ id: opts.id });
    const def = Object.hasOwn(ctx.state.models?.providers ?? {}, view.provider) ? ctx.state.models!.providers![view.provider]!.definition : undefined;
    const name = typeof opts.action === "string" ? opts.action : "";
    const declared = def?.actions && Object.hasOwn(def.actions, name) ? def.actions[name] : undefined;
    if (!declared || typeof declared.run !== "function") throw Object.assign(new Error(`Unknown action: ${name.slice(0, 64)}`), { code: "UNKNOWN_ACTION", status: 400 });
    if (!view.enabled) throw Object.assign(new Error("Connection is disabled"), { code: "DISABLED", status: 409 });
    const { conn } = await ctx.fns.models.resolve({ id: view.id, timeoutMs: 120000 });
    const seen: string[] = [];
    const secret = conn.secret;
    conn.secret = async (key: string) => { const value = await secret(key); if (value) seen.push(value); return value; };
    let result: types.models.ActionValue;
    try { result = await declared.run(ctx, conn, opts.input ?? null); }
    catch (error) { throw Object.assign(new Error(ctx.fns.models.safeMessage({ message: error, secrets: seen, fallback: "Action failed" })), { code: "ACTION_FAILED", status: 422 }); }
    let json: string;
    try { json = JSON.stringify(result ?? null); } catch { throw Object.assign(new Error("Action returned a non-JSON result"), { code: "ACTION_FAILED", status: 422 }); }
    for (const key of Object.keys(view.secrets)) if (view.secrets[key]) { const v = await secret(key); if (v) seen.push(v); }
    if (json.includes("secret://") || seen.some(v => v.length >= 4 && json.includes(v))) throw Object.assign(new Error("Action result withheld: it contained a credential"), { code: "ACTION_FAILED", status: 422 });
    return JSON.parse(json) as types.models.ActionValue;
}
