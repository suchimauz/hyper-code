/**
 * Hold a Postgres session advisory lock on one pinned connection across sequential transactions
 *
 * Use for database-backed liveness spanning multiple transactions and awaited external work. The callback must await all database work. Nested session locks and starting inside a transaction are rejected. Closed async scopes cannot reuse the connection. tryOnly skips the callback when another session owns the key; release and unlock run on every exit.
 * @param opts.key Stable application-namespaced lock key hashed by Postgres hashtextextended.
 * @param opts.tryOnly Attempt without waiting for the advisory lock; a busy key returns acquired false. @default false
 * @param opts.fn Awaited body on the pinned connection; return a value or throw after awaiting all work.
 */
export default async function <T>(
    ctx: Context,
    session: Session | null,
    opts: {
        /** Stable application-namespaced lock key hashed by Postgres hashtextextended. */
        key: string;
        /** Attempt without waiting for the advisory lock; a busy key returns acquired false. @default false */
        tryOnly?: boolean;
        /** Awaited body on the pinned connection; return a value or throw after awaiting all work. */
        fn: () => Promise<T>;
    },
): Promise<{ acquired: boolean; value?: T }> {
    // mauzcode: pin one pool connection so max:1 also supports sequential transactions.
    const { AsyncLocalStorage } = await import("node:async_hooks");
    const st = ((ctx.state.procs ??= {} as any).db ??= {});
    if (st.transactionStorage?.getStore()) throw new Error("Session locks cannot start inside a database transaction");
    const storage = (st.connectionStorage ??= new AsyncLocalStorage<{ connection: Awaited<ReturnType<typeof ctx.fns.procs.db.conn>>; active: boolean }>());
    const existing = storage.getStore();
    if (existing) throw new Error(existing.active ? "Nested database session locks are not supported" : "Database session connection scope is closed");
    const pool = await ctx.fns.procs.db.conn({});
    const connection = await pool.reserve();
    const scope = { connection: connection as typeof pool, active: true };
    try {
        return await storage.run(scope, async () => {
            let acquired = false;
            try {
                if (opts.tryOnly) {
                    const [row] = await ctx.fns.procs.db.select({ sql: "SELECT pg_try_advisory_lock(hashtextextended(?, 0)) AS acquired", params: [opts.key] });
                    acquired = row.acquired === true;
                } else {
                    await ctx.fns.procs.db.select({ sql: "SELECT pg_advisory_lock(hashtextextended(?, 0))", params: [opts.key] });
                    acquired = true;
                }
                if (!acquired) return { acquired: false };
                return { acquired: true, value: await opts.fn() };
            } finally {
                if (acquired) {
                    try {
                        await ctx.fns.procs.db.select({ sql: "SELECT pg_advisory_unlock(hashtextextended(?, 0))", params: [opts.key] });
                    } catch (error) {
                        // Never return a possibly still-locked session to the pool.
                        await connection.close();
                        throw error;
                    }
                }
            }
        });
    } finally {
        scope.active = false;
        connection.release();
    }
}
