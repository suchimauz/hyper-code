import { test, expect } from "bun:test";
import listModels from "./listModels";
import modelPickerHtml from "../agent/modelPickerHtml";

test("named-only local Codex remains in rendered picker with a Hyper current route", async () => {
    const originalFetch = globalThis.fetch;
    const requested: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
        if (String(url).includes("/codex/models")) return Response.json({ models: [{ slug: "gpt-6-astra" }] });
        throw new Error("offline test");
    }) as typeof fetch;
    const rows = [{ provider: "codex", account: "pro500", source: "file", available: true }];
    const remoteModels = ["codex/pro:gpt-6-astra", "codex/pro500:gpt-6-astra"];
    const ctx = { env: {}, state: {}, fns: {
        settings: { get: async () => [] },
        llm: {
            modelPolicy: async () => ({ disabledModels: [] }),
            gatewayHealth: async () => ({ ok: false, models: [] }),
            listAccounts: async () => rows,
            resolveEndpoint: async () => ({ apiKey: null }),
            refreshCodex: async ({ account }: { account: string }) => { requested.push(account); return "test-token"; },
            codexCliVersion: async () => "1",
        },
        node: {
            list: async () => [{ name: "mini6", enabled: true }],
            refresh: async () => ({ name: "mini6", enabled: true, catalogAt: 1, catalog: remoteModels.map(id => ({ id })) }),
        },
        procs: { ui: {
            escape: ({ text }: { text: string }) => text,
            button: ({ html, ariaLabel }: { html: string; ariaLabel: string }) => `<button aria-label="${ariaLabel}">${html}</button>`,
        } },
        ui: { modelLogo: () => "" },
    } } as unknown as Context;
    try {
        const groups = await listModels(ctx, null);
        expect(requested).toEqual(["pro500"]);
        expect(groups.codex).toEqual(["codex/pro500:gpt-6-astra"]);
        expect(groups["hyper/mini6"]).toEqual(remoteModels.map(id => `hyper/mini6:${id}`));
        (ctx.fns.llm as any).listModels = async () => groups;
        const html = await modelPickerHtml(ctx, null, { current: "hyper/mini6:codex/pro:gpt-6-astra", mode: "form" });
        expect(html).toContain("Show Codex accounts");
        expect(html).toContain("codex/pro500:gpt-6-astra");
        expect(html).toContain("hyper/mini6:codex/pro:gpt-6-astra");
        expect(html).toContain("hyper/mini6:codex/pro500:gpt-6-astra");
    } finally { globalThis.fetch = originalFetch; }
});
