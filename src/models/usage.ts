/**
 * Report a connection's usage in the standard shape, falling back to cached status
 *
 * Use for quota/balance displays. Disabled connections return status `disabled` without network. When the provider implements `usage`, returns its windows and balance normalized to the standard shape (percent clamped to 0–100); otherwise returns only status, reason and check time from the cached connection test. Results are cached for 60 s per connection revision; pass `refresh` to bypass. Provider failures become `unavailable` without secret values.
 * @param opts.id Connection UUID.
 * @param opts.refresh Ignore a cached result and query again. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Ignore a cached result and query again. @default false */
        refresh?: boolean;
    },
): Promise<types.models.UsageReport> {
    const view = await ctx.fns.models.get({ id: opts.id });
    if (!view.enabled) return { status: "disabled", reason: "disabled", checkedAt: Date.now() };
    const def = Object.hasOwn(ctx.state.models?.providers ?? {}, view.provider) ? ctx.state.models!.providers![view.provider]!.definition : undefined;
    if (!def?.usage) {
        const t = await ctx.fns.models.test({ id: view.id, cached: opts.refresh !== true });
        return { status: t.status, reason: t.reason, checkedAt: t.checkedAt };
    }
    return await ctx.fns.models.cached({ connection: view, kind: "usage", reuse: opts.refresh !== true, run: async (): Promise<types.models.UsageReport> => {
        try {
            const { definition, conn } = await ctx.fns.models.resolve({ id: view.id });
            const r = await definition.usage!(ctx, conn);
            if (!r || !["available", "unavailable", "configured"].includes(r.status)) throw new Error("Provider returned an invalid usage report");
            const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : undefined;
            const windows = Array.isArray(r.windows) ? r.windows.slice(0, 20).filter(w => w && typeof w.label === "string").map(w => {
                const usedPercent = num(w.usedPercent), remaining = num(w.remaining), resetAt = num(w.resetAt);
                return { label: w.label.slice(0, 100), ...(usedPercent !== undefined ? { usedPercent: Math.min(100, Math.max(0, usedPercent)) } : {}), ...(remaining !== undefined ? { remaining } : {}), ...(resetAt !== undefined ? { resetAt } : {}) };
            }) : undefined;
            const balance = r.balance && num(r.balance.amount) !== undefined && typeof r.balance.currency === "string" ? { amount: r.balance.amount, currency: r.balance.currency.slice(0, 16) } : undefined;
            return { status: r.status, ...(typeof r.reason === "string" ? { reason: r.reason.slice(0, 64) } : {}), checkedAt: Date.now(), ...(typeof r.plan === "string" ? { plan: r.plan.slice(0, 100) } : {}), ...(windows ? { windows } : {}), ...(balance ? { balance } : {}) };
        } catch (error) {
            const code = (error as { code?: unknown } | null)?.code;
            return { status: "unavailable", reason: code === "TRANSPORT" ? "transport-failed" : code === "UNKNOWN_PROVIDER" ? "unknown-provider" : "usage-failed", checkedAt: Date.now() };
        }
    } }) as types.models.UsageReport;
}
