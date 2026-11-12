/**
 * Run a connection health check once per revision with a 60-second cache
 *
 * Internal helper for models.test and models.usage. Keys entries by connection id, a hash of its id and updatedAt, and the check kind; concurrent callers share one in-flight promise, stale revisions of the same connection are dropped, and failures are not cached.
 * @param opts.connection Connection identity and revision.
 * @param opts.kind Which check is cached.
 * @param opts.run Performs the check when no fresh result exists.
 * @param opts.reuse Return a fresh cached result instead of running again. @default true
 * @param opts.ttlMs Cache lifetime in milliseconds. @default 60000 @minimum 0
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection identity and revision. */
        connection: { id: string; updatedAt: number };
        /** Which check is cached. */
        kind: "test" | "usage";
        /** Performs the check when no fresh result exists. */
        run: () => Promise<types.models.UsageReport | types.models.TestResult>;
        /** Return a fresh cached result instead of running again. @default true */
        reuse?: boolean;
        /** Cache lifetime in milliseconds. @default 60000 @minimum 0 */
        ttlMs?: number;
    },
): Promise<types.models.UsageReport | types.models.TestResult> {
    const health = ((ctx.state.models ??= {}).health ??= {});
    const { id, updatedAt } = opts.connection;
    const revision = `${id}:${Bun.hash(`${id}:${updatedAt}`).toString(36)}`;
    for (const k of Object.keys(health)) if (k.startsWith(`${id}:`) && !k.startsWith(`${revision}:`)) delete health[k];
    const key = `${revision}:${opts.kind}`;
    const hit = health[key];
    if (hit?.pending) return await hit.pending;
    if (opts.reuse !== false && hit?.result && hit.expiresAt > Date.now()) return hit.result;
    const pending = opts.run();
    health[key] = { expiresAt: 0, pending };
    try {
        const result = await pending;
        if (health[key]?.pending === pending) health[key] = { expiresAt: Date.now() + (opts.ttlMs ?? 60000), result };
        return result;
    } catch (error) {
        if (health[key]?.pending === pending) delete health[key];
        throw error;
    }
}
