// Lazily open the Postgres pool (Bun.SQL) and cache it in this module's own
// state — ctx.state.procs.db.sql, like every module's state. Because state is
// per-ctx, a forked test env (env.fork) gets its OWN isolated pool.
//
// mauzcode: under NODE_ENV=test the pool is capped at ONE connection; the database is the test process's
// copy of the migrated template (src/_testDb.entry.ts), reset between tests. Test pools register on globalThis
// for the harness to close (idle pooled connections would otherwise exhaust max_connections across the suite).
import { SQL } from "bun";

/**
 * Get the transaction connection, pinned session connection, or this context's Postgres pool, in that order.
 * Closed transaction and session scopes throw instead of silently using a released connection.
 */
export default async function (ctx: Context, _session: Session | null, _opts?: {}): Promise<SQL> {
    const st = ((ctx.state.procs ??= {} as any).db ??= {});
    const scope = st.transactionStorage?.getStore();
    if (scope) {
        if (!scope.active) throw new Error("Database transaction scope is closed");
        return scope.connection;
    }
    // mauzcode: session locks span sequential transactions on ONE reserved connection.
    const pinned = st.connectionStorage?.getStore();
    if (pinned) {
        if (!pinned.active) throw new Error("Database session connection scope is closed");
        return pinned.connection;
    }
    if (st.sql) return st.sql;
    const url = ctx.fns.procs.db.url();
    st.url = url;
    const isTest = ctx.env.NODE_ENV === "test";
    // prepare:false — Bun 1.3.14 loses queued queries under concurrent
    // parameterized queries on a saturated pool (server idles in ClientRead,
    // client promises never resolve). The simple protocol has no such bug.
    const sql = new SQL(url, { max: isTest ? 1 : Number(ctx.env.PG_POOL_MAX) || 8, prepare: false });
    if (isTest) (((globalThis as any).__mauzcodeTestPools ??= new Set()) as Set<SQL>).add(sql);
    st.sql = sql;
    return sql;
}
