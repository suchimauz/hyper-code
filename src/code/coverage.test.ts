import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { testCtx } from "../$test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";

// One throwaway project on disk and ONE ctx for the whole file (booting a ctx on a custom root costs ~0.5 s;
// the index itself ~50 ms). Each test replaces the project's files and re-indexes it from empty, so tests
// stay independent while paying the boot once.
let shared: { ctx: any; dir: string; root: string };
beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "code-coverage-"));
    mkdirSync(join(dir, "src"), { recursive: true });
    shared = { ctx: await testCtx({ root: dir }), dir, root: basename(dir) };
});
afterAll(() => rmSync(shared.dir, { recursive: true, force: true }));

// Replace the project's files and clear what the previous test left in the graph — without indexing them.
async function project(files: Record<string, string>) {
    const { ctx, dir, root } = shared;
    rmSync(join(dir, "src"), { recursive: true, force: true });
    mkdirSync(join(dir, "src"), { recursive: true });
    await ctx.fns.procs.db.exec({ sql: "TRUNCATE code_calls, code_functions, code_types, code_findings, code_file_metrics, code_function_metrics" });
    for (const [rel, body] of Object.entries(files)) {
        const abs = join(dir, "src", rel);
        mkdirSync(join(abs, ".."), { recursive: true });
        writeFileSync(abs, body);
    }
    return shared;
}

async function indexed(files: Record<string, string>) {
    const { ctx, dir, root } = await project(files);
    const result = await ctx.fns.code.index({ root });
    return { ctx, dir, root, result, cleanup: () => {} };
}

describe("code.coverage", () => {
    test("a function a test calls is direct, one nothing reaches is none", async () => {
        const { ctx, root, cleanup } = await indexed({
            "shop/total.ts": `export default function () { return 42; }\n`,
            "shop/total.test.ts": `import { test } from "bun:test";\ntest("x", async () => { await (globalThis as any).ctx.fns.shop.total({}); });\n`,
            "shop/lonely.ts": `export default function () { return 1; }\n`,
        });
        try {
            const c = await ctx.fns.code.coverage({ root, limit: 50 });
            const byName = new Map(c.functions.map(f => [f.name, f]));
            expect(byName.get("shop.total")!.status).toBe("direct");
            expect(byName.get("shop.lonely")!.status).toBe("none");
            expect(c.direct).toBe(1);
            expect(c.none).toBe(1);
        } finally { cleanup(); }
    });

    test("a function reached only through another is indirect, not none", async () => {
        const { ctx, root, cleanup } = await indexed({
            // The distinction that matters: `deep` is exercised by the test suite
            // but nothing pins its own behaviour, so it is neither safe nor dark.
            "shop/outer.ts": `export default async function (ctx: Context) { return await ctx.fns.shop.deep({}); }\n`,
            "shop/deep.ts": `export default function () { return 7; }\n`,
            "shop/outer.test.ts": `import { test } from "bun:test";\ntest("x", async () => { await (globalThis as any).ctx.fns.shop.outer({}); });\n`,
        });
        try {
            const c = await ctx.fns.code.coverage({ root, limit: 50 });
            const byName = new Map(c.functions.map(f => [f.name, f]));
            expect(byName.get("shop.outer")!.status).toBe("direct");
            expect(byName.get("shop.deep")!.status).toBe("indirect");
            expect(c.pctAny).toBe(100);
            expect(c.pctDirect).toBe(50);
        } finally { cleanup(); }
    });

    test("a sibling test file alone proves nothing", async () => {
        const { ctx, root, cleanup } = await indexed({
            // The old measure counted this as covered. The file exists and the
            // function is never touched — which is exactly the lie worth avoiding.
            "shop/untouched.ts": `export default function () { return 1; }\n`,
            "shop/untouched.test.ts": `import { test, expect } from "bun:test";\ntest("checks something else", () => { expect(1 + 1).toBe(2); });\n`,
        });
        try {
            const c = await ctx.fns.code.coverage({ root, limit: 50 });
            expect(c.functions[0]!.status).toBe("none");
            expect(c.direct).toBe(0);
        } finally { cleanup(); }
    });

    test("untestedWithCallers counts only what something depends on", async () => {
        const { ctx, root, cleanup } = await indexed({
            // An untested leaf nobody calls is not a risk; an untested function
            // with callers is. The headline number has to tell them apart.
            "shop/used.ts": `export default function () { return 1; }\n`,
            "shop/caller.ts": `export default async function (ctx: Context) { return await ctx.fns.shop.used({}); }\n`,
            "shop/leaf.ts": `export default function () { return 2; }\n`,
        });
        try {
            const c = await ctx.fns.code.coverage({ root, limit: 50 });
            expect(c.untestedWithCallers).toBe(1);
            expect(c.none).toBe(3);
        } finally { cleanup(); }
    });

    test("status and minCallers narrow the list without changing the totals", async () => {
        const { ctx, root, cleanup } = await indexed({
            "shop/used.ts": `export default function () { return 1; }\n`,
            "shop/caller.ts": `export default async function (ctx: Context) { return await ctx.fns.shop.used({}); }\n`,
            "shop/leaf.ts": `export default function () { return 2; }\n`,
        });
        try {
            const risky = await ctx.fns.code.coverage({ root, status: "none", minCallers: 1, limit: 50 });
            expect(risky.functions.map(f => f.name)).toEqual(["shop.used"]);
            // Totals describe the project, not the filtered view.
            expect(risky.total).toBe(3);
            expect(risky.none).toBe(3);
        } finally { cleanup(); }
    });

    test("the list is ranked by how much depends on each function", async () => {
        const { ctx, root, cleanup } = await indexed({
            "shop/hot.ts": `export default function () { return 1; }\n`,
            "shop/a.ts": `export default async function (ctx: Context) { return await ctx.fns.shop.hot({}); }\n`,
            "shop/b.ts": `export default async function (ctx: Context) { return await ctx.fns.shop.hot({}); }\n`,
            "shop/c.ts": `export default async function (ctx: Context) { return await ctx.fns.shop.cold({}); }\n`,
            "shop/cold.ts": `export default function () { return 2; }\n`,
        });
        try {
            const c = await ctx.fns.code.coverage({ root, limit: 50 });
            expect(c.functions[0]!.name).toBe("shop.hot");
            expect(c.functions[0]!.callers).toBe(2);
        } finally { cleanup(); }
    });

    test("an empty root answers with zeros instead of dividing by zero", async () => {
        const { ctx, cleanup } = await indexed({ "shop/one.ts": `export default function () { return 1; }\n` });
        try {
            const c = await ctx.fns.code.coverage({ root: "nothing-here" });
            expect(c.total).toBe(0);
            expect(c.pctDirect).toBe(0);
            expect(c.functions).toEqual([]);
        } finally { cleanup(); }
    });
});
