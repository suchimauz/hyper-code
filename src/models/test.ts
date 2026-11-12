/**
 * Test a model connection through its provider and cache the safe result
 *
 * Use for an explicit "Test" button or before relying on a connection. Disabled connections return status `disabled` without calling the provider or the network. Otherwise calls the provider `test` with the connection bound to its transport; a throw or a malformed result becomes `unavailable` with a machine-readable reason and a message cleaned of secret values. Results are cached for 60 s per connection revision (any update invalidates) and concurrent calls share one in-flight check.
 * @param opts.id Connection UUID.
 * @param opts.cached Reuse a result from the last 60 s instead of testing again. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Reuse a result from the last 60 s instead of testing again. @default false */
        cached?: boolean;
    },
): Promise<types.models.TestResult> {
    const view = await ctx.fns.models.get({ id: opts.id });
    if (!view.enabled) return { status: "disabled", reason: "disabled", message: "Connection is disabled", checkedAt: Date.now() };
    return await ctx.fns.models.cached({ connection: view, kind: "test", reuse: opts.cached === true, run: async (): Promise<types.models.TestResult> => {
        const seen: string[] = [];
        try {
            const { definition, conn } = await ctx.fns.models.resolve({ id: view.id });
            const secret = conn.secret;
            conn.secret = async (key: string) => { const value = await secret(key); if (value) seen.push(value); return value; };
            const r = await definition.test(ctx, conn);
            if (!r || !["available", "unavailable", "configured"].includes(r.status) || typeof r.reason !== "string") throw new Error("Provider returned an invalid test result");
            return { status: r.status, reason: r.reason.slice(0, 64) || "unknown", message: ctx.fns.models.safeMessage({ message: String(r.message ?? ""), secrets: seen, fallback: r.status }), checkedAt: Date.now() };
        } catch (error) {
            const code = (error as { code?: unknown } | null)?.code;
            const reason = code === "TRANSPORT" ? "transport-failed" : code === "UNKNOWN_PROVIDER" ? "unknown-provider" : "test-failed";
            return { status: "unavailable", reason, message: ctx.fns.models.safeMessage({ message: error, secrets: seen, fallback: "Connection test failed" }), checkedAt: Date.now() };
        }
    } }) as types.models.TestResult;
}
