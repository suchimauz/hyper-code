import { describe, expect, test } from "bun:test";
import logo from "./modelLogo";
import dial from "./usageDial";
import chip from "../chat/modelChip";

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
            const remote = logo(ctx, null, { model: `hyper/mini6:${route}`, compact: true });
            expect(remote.match(/<path d="([^"]+)"/)?.[1]).toBe(local.match(/<path d="([^"]+)"/)?.[1]);
            expect(local).not.toContain("ph-arrows-left-right");
            expect(remote).toContain("ph-arrows-left-right");
            expect(remote).toContain("via Hyper node mini6");
            expect(remote).toContain("size-4");
        }
    });
    test("chat badge names node once alongside existing proxy icon, local stays plain", async () => {
        const direct = await chip(context("codex/work:gpt-6-astra"), null, { agentId: "test" });
        expect(direct).not.toContain("Hyper node");
        const remote = await chip(context('hyper/mini<6":codex/work:gpt-6-astra'), null, { agentId: "test" });
        expect(remote).toContain('Hyper node mini&lt;6&quot;');
        expect(remote).not.toContain('mini<6');
        expect((remote.match(/ph-arrows-left-right/g) ?? []).length).toBe(1);
    });
    test("quota badge survives paused state and identifies node/provider/account accessibly", () => {
        const entry: any = { provider: "codex", account: 'work<"', label: "quota", node: 'mini<6"', usedPercent: 100, resetsAt: null, planType: null, parkedAgents: 1, tone: "error" };
        const ctx = context("");
        const remote = dial(ctx, null, { entries: [entry] });
        expect(remote).toContain("ph-pause");
        expect(remote).toContain("ph-arrows-left-right");
        expect(remote).toContain("Hyper node mini&lt;6&quot; · provider codex · account work&lt;&quot;");
        expect(remote).toContain('aria-hidden="true">mini&lt;6&quot;</span>');
        expect(remote).not.toContain("mini<6");
        expect(dial(ctx, null, { entries: [{ ...entry, node: undefined }] })).not.toContain("ph-arrows-left-right");
    });
});
