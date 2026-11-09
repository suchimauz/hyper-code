import { describe, expect, test } from "bun:test";
import { testCtx } from "../$test";

const ctx = await testCtx({ env: { PROCS_PLUGINS: "./plugins" } });   // official plugins only, not this machine's user plugins

describe("plugins.search", () => {
    test("finds a mounted plugin function and groups by owner", async () => {
        const result = await ctx.fns.plugins.search({ query: "search github issues pull requests", mode: "lexical" });
        const gh = result.find((row: any) => row.plugin === "gh");
        expect(gh).toBeDefined();
        expect(gh!.functions.some((fn: any) => fn.name.startsWith("gh."))).toBe(true);
    });

    test("finds workflow text from SKILL.md even without a function phrase", async () => {
        ctx.fns.embeddings.provider = async () => "off";
        ctx.state.registry.llm.localize = async (_c: any, _s: any, opts: any) => ({ provider: "test", model: "test", localized: Object.fromEntries(opts.functions.map((fn: any) => [fn.name, fn.text.repeat(2)])) });
        await ctx.fns.procs.migrate.up({});
        await ctx.fns.plugins.index({ force: true });
        const result = await ctx.fns.plugins.search({ query: "operator-run OpenSERP service", mode: "bm25" });
        const websearch = result.find((row: any) => row.plugin === "websearch");
        expect(websearch).toBeDefined();
        expect(websearch!.pluginEvidence?.evidence).toBe("plugin-bm25");
    });

});
