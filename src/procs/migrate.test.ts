import { test, expect } from "bun:test";
import { testCtx } from "../$test";

const ctx = await testCtx();

test("migrate: up (in id order, idempotent) + status + down", async () => {
    // The worker database already holds the core migrations; a fork with its own list adds two whose ids
    // sort after every real one, so down() (latest applied first) touches only them.
    const c = ctx.fns.procs.env.fork({ mode: "test" });
    (c.state.procs as any).migrate = {
        list: [
            { id: "zz_test_001_a", up: (x: Context) => x.fns.procs.db.exec({ sql: "CREATE TABLE migrate_test_a (x INTEGER)" }), down: (x: Context) => x.fns.procs.db.exec({ sql: "DROP TABLE migrate_test_a" }) },
            { id: "zz_test_002_b", up: (x: Context) => x.fns.procs.db.exec({ sql: "CREATE TABLE migrate_test_b (y INTEGER)" }) },
        ],
    };
    expect((await c.fns.procs.migrate.up({})).applied).toEqual(["zz_test_001_a", "zz_test_002_b"]);
    expect((await c.fns.procs.migrate.up({})).applied).toEqual([]); // idempotent
    expect((await c.fns.procs.migrate.status({})).every((m: any) => m.applied)).toBe(true);

    expect((await c.fns.procs.migrate.down({})).rolledBack).toEqual(["zz_test_002_b"]); // last only
    expect((await c.fns.procs.migrate.status({})).find((m: any) => m.id === "zz_test_002_b")!.applied).toBe(false);
    expect((await c.fns.procs.migrate.down({})).rolledBack).toEqual(["zz_test_001_a"]);
    expect(await c.fns.procs.db.select({ sql: "SELECT to_regclass('migrate_test_a')::text AS t" })).toEqual([{ t: null }]);
});
