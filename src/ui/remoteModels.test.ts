import { describe, expect, test } from "bun:test";
import logo from "./modelLogo";

function context(model: string) {
    const ctx: any = { state: { agent: { test: { model } } }, fns: {
        procs: { ui: { escape: ({ text }: any) => Bun.escapeHTML(String(text)) } },
        llm: { reasoningCapabilities: async () => null, resolveReasoningEffort: async () => null },
        ui: { popup: ({ html, attrs }: any) => `<button ${attrs}>${html}</button>` },
    } };
    ctx.fns.ui.modelLogo = (opts: any) => logo(ctx, null, opts);
    return ctx;
}

describe("remote model UI identity", () => {
    test("nested canonical provider keeps the same mark as direct route", () => {
        for (const route of ["cursor/work:claude-opus-5-5", "codex/work:gpt-6-astra", "xai/work:grok-4.7"]) {
            const ctx = context(route);
            const local = logo(ctx, null, { model: route });
            const remote = logo(ctx, null, { model: `mauzcode/mini6:${route}`, compact: true });
            expect(remote.match(/<path d="([^"]+)"/)?.[1]).toBe(local.match(/<path d="([^"]+)"/)?.[1]);
            expect(local).not.toContain("ph-arrows-left-right");
            expect(remote).toContain("ph-arrows-left-right");
            expect(remote).toContain("via MauzCode node mini6");
            expect(remote).toContain("size-4");
        }
    });
    test("retained provider mark escapes the node and renders one transport marker", () => {
        const direct = logo(context("codex/work:gpt-6-astra"), null, { model: "codex/work:gpt-6-astra" });
        expect(direct).not.toContain("MauzCode node");
        const remote = logo(context('mauzcode/mini<6":codex/work:gpt-6-astra'), null, { model: 'mauzcode/mini<6":codex/work:gpt-6-astra' });
        expect(remote).toContain('MauzCode node mini&lt;6&quot;');
        expect(remote).not.toContain('mini<6');
        expect((remote.match(/ph-arrows-left-right/g) ?? []).length).toBe(1);
    });

});
