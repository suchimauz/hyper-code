import { describe, expect, test } from "bun:test";
import { testCtx } from "../$test";

const ctx = await testCtx({ env: { PROCS_PLUGINS: "./plugins" } });   // official plugins only, not this machine's user plugins

describe("generated plugin docs", () => {
    test("deduplicates mounted functions and exposes runtime metadata", () => {
        const result = ctx.fns.plugins.docs({ name: "gh" });
        expect(result.functions.map((fn: any) => fn.name)).toEqual([...new Set(result.functions.map((fn: any) => fn.name))]);
        const search = result.functions.find((fn: any) => fn.name === "gh.search");
        expect(search).toBeDefined();
        expect(search!.summary).toContain("Search GitHub");
        expect(search!.paramsSchema.properties.q).toBeDefined();
    });

    test("plugins.read combines overview with generated functions", async () => {
        const result = await ctx.fns.plugins.read({ name: "gh" });
        expect(result.overview.markdown).toContain("# GitHub");
        expect(result.functions.some((fn: any) => fn.name === "gh.pr")).toBe(true);
    });
});
