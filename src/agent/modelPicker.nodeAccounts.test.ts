import { test, expect } from "bun:test";
import picker from "./modelPickerHtml";

test("mini6 picker exposes two independently routed Codex account panels and quotas", async () => {
    const names = ["su4imauz", "NylahKamalii9806"];
    const routes = names.map(a => `hyper/mini6:codex/${a}:gpt-test`);
    const ctx = { fns: {
        llm: { listModels: async () => ({ "hyper/mini6": routes }), listAccounts: async () => [{ provider: "hyper", account: "mini6", available: true }] },
        node: { list: async () => [{ name: "mini6", enabled: true, catalog: names.map(account => ({ id: `codex/${account}:gpt-test`, provider: "codex", account, api: "responses", kind: "subscription" })), usage: names.map((account, i) => ({ provider: "codex", account, usedPercent: i ? 12 : 100 })) }] },
        ui: { modelLogo: () => "" },
        procs: { ui: { escape: ({ text }: { text: string }) => Bun.escapeHTML(text), button: ({ html, attrs }: { html: string; attrs?: Record<string, unknown> }) => `<button ${Object.entries(attrs ?? {}).map(([k,v]) => `${k}="${Bun.escapeHTML(String(v))}"`).join(" ")}>${html}</button>` } },
    } } as unknown as Context;
    const html = await picker(ctx, null, { current: routes[1]!, mode: "form" });
    for (const name of names) expect(html).toContain(name);
    for (const route of routes) expect(html).toContain(route);
    expect(html).toContain("0% left");
    expect(html).toContain("88% left");
    expect(html).toContain("mini6 → Codex");
});
