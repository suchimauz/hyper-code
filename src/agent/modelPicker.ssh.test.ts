import { test, expect } from "bun:test";
import picker from "./modelPickerHtml";

test("SSH picker keeps instances, providers, accounts and both route colons distinct", async () => {
    const routes = ["ssh/alpha:codex/main:gpt-test", "ssh/alpha:claude-code/work:claude-test", "ssh/beta:codex/main:gpt-test"];
    const ctx = { fns: {
        llm: {
            modelPolicy: async () => ({ disabledModels: [] }),
            listModels: async () => ({ codex: ["codex:gpt-test"], "ssh/alpha": routes.slice(0, 2), "ssh/beta": routes.slice(2) }),
            listAccounts: async () => [{ provider: "codex", account: "ssh.alpha.main", source: "ssh", available: true, usedPercent: 12 }],
        },
        node: { list: async () => [] }, ui: { modelLogo: () => "" },
        procs: { ui: { escape: ({ text }: { text: string }) => Bun.escapeHTML(text), button: ({ html, attrs }: { html: string; attrs?: Record<string, unknown> }) => `<button ${Object.entries(attrs ?? {}).map(([k,v]) => `${k}="${Bun.escapeHTML(String(v))}"`).join(" ")}>${html}</button>` } },
    } } as unknown as Context;
    const html = await picker(ctx, null, { current: routes[1]!, mode: "form" });
    for (const route of routes) expect(html).toContain(`data-model-route="${route}"`);
    expect(html).toContain("alpha → Codex · main");
    expect(html).toContain("alpha → Claude Code · work");
    expect(html).toContain("beta → Codex · main");
    expect(html).toContain("88% left");
    expect(html).toContain('data-model-route="codex:gpt-test"');
    expect(html).not.toContain('data-model-route="codex/ssh.');
    expect(html).not.toContain('data-model-route="ssh:');
});
