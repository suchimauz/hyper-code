import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { testCtx } from "../$test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
// A chain plus a branch plus a cycle: enough shape that depth, dedup and
// termination are all actually exercised rather than asserted about.
//   $route_go_GET → orders.place → orders.charge → payments.capture
//                   orders.audit → orders.charge
//                   loop.a ⇄ loop.b
const FILES: Record<string, string> = {
    "orders/$route_go_GET.ts": `export default async function (ctx: Context) { await ctx.fns.orders.place({}); }\n`,
    "orders/place.ts": `export default async function (ctx: Context) { await ctx.fns.orders.charge({}); }\n`,
    "orders/audit.ts": `export default async function (ctx: Context) { await ctx.fns.orders.charge({}); }\n`,
    "orders/charge.ts": `export default async function (ctx: Context) { await ctx.fns.payments.capture({}); }\n`,
    "payments/capture.ts": `export default async function () { return 1; }\n`,
    "orders/orphan.ts": `export default async function () { return 1; }\n`,
    "loop/a.ts": `export default async function (ctx: Context) { await ctx.fns.loop.b({}); }\n`,
    "loop/b.ts": `export default async function (ctx: Context) { await ctx.fns.loop.a({}); }\n`,
};

// One fixture project, indexed once for the whole file (a ctx + index build costs ~1 s); the tests only read
// the graph, except the last one, which adds a test file and re-indexes.
let ctx: any, dir: string, root: string;
beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "code-callers-"));
    for (const [rel, body] of Object.entries(FILES)) {
        const abs = join(dir, "src", rel);
        mkdirSync(join(abs, ".."), { recursive: true });
        writeFileSync(abs, body);
    }
    ctx = await testCtx({ root: dir });
    root = basename(dir);
    await ctx.fns.code.index({ root });
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("code.callers", () => {
    test("direct callers with file and line; depth walks back to the entry point", async () => {
        const direct = await ctx.fns.code.callers({ name: "payments.capture" });
        expect(direct.exists).toBe(true);
        expect(direct.callers).toEqual([
            { caller: "orders.charge", rel: "orders/charge.ts", line: 1, kind: "fn", depth: 1, entryPoint: false },
        ]);
        const two = await ctx.fns.code.callers({ name: "orders.charge" });
        expect(two.callers.map((c: any) => c.caller).sort()).toEqual(["orders.audit", "orders.place"]);

        const deep = await ctx.fns.code.callers({ name: "payments.capture", depth: 4 });
        const byName = Object.fromEntries(deep.callers.map((c: any) => [c.caller, c]));
        expect(byName["orders.charge"]!.depth).toBe(1);
        expect(byName["orders.place"]!.depth).toBe(2);
        expect(byName["orders.$route_go_GET"]!.depth).toBe(3);
        expect(byName["orders.$route_go_GET"]!.entryPoint).toBe(true);
    });

    test("a cycle terminates; unknown and uncalled names are told apart", async () => {
        const cycle = await ctx.fns.code.callers({ name: "loop.a", depth: 10 });
        expect(cycle.callers.map((c: any) => c.caller).sort()).toEqual(["loop.a", "loop.b"]);
        expect(await ctx.fns.code.callers({ name: "nope.missing" })).toMatchObject({ exists: false, callers: [] });
        expect(await ctx.fns.code.callers({ name: "orders.orphan" })).toMatchObject({ exists: true, callers: [] });
    });
});

describe("code.slice", () => {
    test("returns what it calls, who calls it, and optionally its source", async () => {
        const s = await ctx.fns.code.slice({ name: "orders.charge" });
        expect(s.found).toBe(true);
        expect(s.rel).toBe("orders/charge.ts");
        expect(s.calls.map((c: any) => c.name)).toEqual(["payments.capture"]);
        expect(s.callers.map((c: any) => c.caller).sort()).toEqual(["orders.audit", "orders.place"]);
        expect(s.source).toContain("payments.capture");
        expect((await ctx.fns.code.slice({ name: "orders.charge", includeSource: false })).source).toBeUndefined();
        expect((await ctx.fns.code.slice({ name: "nope.missing" })).found).toBe(false);
    });
});

describe("code.dead", () => {
    test("lists uncalled functions; routes and what they call are not dead", async () => {
        const r = await ctx.fns.code.dead({ root });
        // orphan is called by nobody; audit calls charge but nothing calls audit. The route is not listed
        // even though no code calls it either: the framework does.
        expect(r.functions.map((f: any) => f.name)).toEqual(["orders.audit", "orders.orphan"]);
        expect(r.total).toBe(2);
        expect(r.uncalledTotal).toBe(2);
        expect(r.testOnlyTotal).toBe(0);
    });

    // Last: mutates the fixture.
    test("a function only its test calls is test-only, and a test file is never a candidate", async () => {
        writeFileSync(join(dir, "src", "orders", "orphan.test.ts"),
            `import { test } from "bun:test";\ntest("orphan", async () => { await ctx.fns.orders.orphan({}); });\n`);
        await ctx.fns.code.index({ root });

        const r = await ctx.fns.code.dead({ root });
        const byName = Object.fromEntries(r.functions.map((f: any) => [f.name, f]));
        expect(byName["orders.orphan"]!.status).toBe("test-only");
        expect(byName["orders.orphan"]!.testCallers).toBe(1);
        expect(byName["orders.audit"]!.status).toBe("uncalled");
        expect(r.uncalledTotal).toBe(1);
        expect(r.testOnlyTotal).toBe(1);
        expect((await ctx.fns.code.dead({ root, includeTestOnly: false })).functions.map((f: any) => f.name)).toEqual(["orders.audit"]);
        expect(await ctx.fns.procs.db.select({ sql: "SELECT name FROM code_functions WHERE name LIKE '%test%'", params: [] })).toEqual([]);
    });
});
