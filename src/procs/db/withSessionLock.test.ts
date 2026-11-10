import { test, expect } from "bun:test";
import { testCtx } from "../../$test";

const ctx = await testCtx();
function gate() {
    let resolve!: () => void;
    const promise = new Promise<void>(r => { resolve = r; });
    return { promise, resolve };
}

test("session lock: max1 connection survives two transactions including rollback", async () => {
    const pool = await ctx.fns.procs.db.conn({});
    const result = await ctx.fns.procs.db.withSessionLock({ key: "test:sequential", fn: async () => {
        const [{ pid }] = await ctx.fns.procs.db.select({ sql: "SELECT pg_backend_pid() AS pid" });
        expect(await ctx.fns.procs.db.conn({})).not.toBe(pool);
        await ctx.fns.procs.db.transaction({ fn: async () => {
            expect(await ctx.fns.procs.db.select({ sql: "SELECT pg_backend_pid() AS pid" })).toEqual([{ pid }]);
            await ctx.fns.procs.db.exec({ sql: "CREATE TEMP TABLE session_lock_items (v INT)" });
            await ctx.fns.procs.db.run({ sql: "INSERT INTO session_lock_items VALUES (1)" });
        } });
        await expect(ctx.fns.procs.db.transaction({ fn: async () => {
            expect(await ctx.fns.procs.db.select({ sql: "SELECT pg_backend_pid() AS pid" })).toEqual([{ pid }]);
            await ctx.fns.procs.db.run({ sql: "INSERT INTO session_lock_items VALUES (2)" });
            throw new Error("rollback sentinel");
        } })).rejects.toThrow("rollback sentinel");
        expect(await ctx.fns.procs.db.select({ sql: "SELECT v FROM session_lock_items" })).toEqual([{ v: 1 }]);
        return { pid, success: true };
    } });
    expect(result.acquired).toBe(true);
    expect(result.value).toMatchObject({ success: true });
    expect(await ctx.fns.procs.db.conn({})).toBe(pool);
    expect(await ctx.fns.procs.db.withSessionLock({ key: "test:sequential", tryOnly: true, fn: async () => 42 })).toEqual({ acquired: true, value: 42 });
});

test("session lock: exception releases lock and escaped async callbacks cannot reuse connection", async () => {
    for (const fail of [false, true]) {
        const release = gate();
        let escaped!: Promise<unknown>;
        const work = ctx.fns.procs.db.withSessionLock({ key: "test:escaped", fn: async () => {
            escaped = release.promise.then(() => ctx.fns.procs.db.select({ sql: "SELECT 1" }));
            if (fail) throw new Error("body failed");
            return "ok";
        } });
        if (fail) await expect(work).rejects.toThrow("body failed");
        else expect(await work).toEqual({ acquired: true, value: "ok" });
        release.resolve();
        await expect(escaped).rejects.toThrow("Database session connection scope is closed");
        expect(await ctx.fns.procs.db.withSessionLock({ key: "test:escaped", tryOnly: true, fn: async () => null })).toEqual({ acquired: true, value: null });
    }
});

test("session lock: same key blocks, different key proceeds, tryOnly skips busy callback across contexts", async () => {
    const other = await testCtx();
    const third = await testCtx();
    const entered = gate();
    const release = gate();
    const holder = ctx.fns.procs.db.withSessionLock({ key: "test:shared", fn: async () => {
        entered.resolve();
        await release.promise;
        return "holder";
    } });
    try {
        await entered.promise;
        let called = false;
        expect(await other.fns.procs.db.withSessionLock({ key: "test:shared", tryOnly: true, fn: async () => { called = true; } })).toEqual({ acquired: false });
        expect(called).toBe(false);
        expect(await other.fns.procs.db.withSessionLock({ key: "test:different", tryOnly: true, fn: async () => "different" })).toEqual({ acquired: true, value: "different" });
        const waiter = other.fns.procs.db.withSessionLock({ key: "test:shared", fn: async () => { called = true; return "waiter"; } });
        // Observe the database wait instead of assuming a timer proves exclusion.
        let waiting = false;
        for (let attempt = 0; attempt < 100; attempt++) {
            const rows = await third.fns.procs.db.select({ sql: "SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted" });
            if (rows.length) { waiting = true; break; }
            await Bun.sleep(10);
        }
        expect(waiting).toBe(true);
        expect(called).toBe(false);
        release.resolve();
        expect(await holder).toEqual({ acquired: true, value: "holder" });
        expect(await waiter).toEqual({ acquired: true, value: "waiter" });
    } finally { release.resolve(); await holder; }
});

test("session lock: rejects nesting and starting inside transactions without deadlocking max1", async () => {
    await ctx.fns.procs.db.withSessionLock({ key: "test:nesting", fn: async () => {
        await expect(ctx.fns.procs.db.withSessionLock({ key: "test:nested", fn: async () => 1 })).rejects.toThrow("Nested database session locks");
        await ctx.fns.procs.db.transaction({ fn: async () => {
            await expect(ctx.fns.procs.db.transaction({ fn: async () => 1 })).rejects.toThrow("Nested database transactions");
        } });
    } });
    await ctx.fns.procs.db.transaction({ fn: async () => {
        await expect(ctx.fns.procs.db.withSessionLock({ key: "test:inside-tx", fn: async () => 1 })).rejects.toThrow("cannot start inside a database transaction");
    } });
});
