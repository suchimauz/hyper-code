import { describe, expect, test } from "bun:test";
import route from "./$route_usage_GET";
import dial from "../ui/usageDial";
import usageData from "./usageData";

const local = { provider: "codex", account: "local", label: "Local quota", usedPercent: 21, resetsAt: null, planType: null, parkedAgents: 0, tone: "neutral" };
const catalog = Array.from({ length: 14 }, (_, i) => ({ id: `model-${i}`, provider: "codex", account: i < 7 ? "su4imauz" : "NylahKamalii9806", kind: "subscription" }));
function node(patch = {}) {
    return { name: "mini6", enabled: true, catalogAt: Date.now(), usageAt: Date.now(), lastError: null, catalog,
        usage: [{ provider: "codex", account: "su4imauz", usedPercent: 17 }, { provider: "codex", account: "NylahKamalii9806", usedPercent: 83 }], ...patch };
}
async function render(nodes: any[], locals: any[] = [local], groups?: Record<string, string[]>, gateway?: any) {
    let calls = 0;
    const ctx: any = { state: { llmUsageRefresh: { startedAt: Date.now() } }, fns: {
        llm: { ...(gateway ? { gatewayHealth: async () => gateway } : {}), usageOverview: async () => locals, listModels: async (opts: any) => { expect(opts).toEqual({}); calls++; return groups ?? Object.fromEntries(nodes.map(n => [`hyper/${n.name}`, n.catalog.map((m: any) => `hyper/${n.name}:${m.id}`)])); } },
        node: { list: async () => nodes },
        procs: { ui: { escape: ({ text }: any) => String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!) ) } },
        ui: { live: ({ html }: any) => html, usageDial: (opts: any) => dial(ctx, null, opts), modelLogo: () => "<span></span>" },
    } };
    ctx.fns.llms = { usageData: (opts: {}) => usageData(ctx, null, opts) };
    const html = await (await route(ctx, null, {})).text();
    expect(calls).toBe(1);
    return html;
}
const count = (html: string) => (html.match(/href="\/llms"/g) ?? []).length;
describe("account quota dock", () => {
    test("gateway API badge is distinct from quota rings", async () => {
        const html = await render([node()], [local], undefined, { status: "available", reason: "models-ok" });
        expect(html).toContain('data-gateway="oneapi"');
        expect(html).toContain("Asoft LLM Gate · available");
        expect(html).toContain("generation not verified; quota unavailable");
        expect(count(html)).toBe(4);
        expect(html).toContain("17% used");
    });
    test("local-only is preserved", async () => { const html = await render([]); expect(count(html)).toBe(1); expect(html).toContain("21% used"); });
    test("old relayed snapshots do not duplicate account rings", async () => { expect(count(await render([node()], [local, { ...local, provider: "hyper" }]))).toBe(3); });
    test("same account on different providers and nodes stays distinct", async () => { const n = node({ catalog: [{ id: "a", provider: "codex", account: "same" }, { id: "b", provider: "claude-code", account: "same" }] }); expect(count(await render([n, { ...n, name: "other" }], []))).toBe(4); });
    test("no nodes or local data is empty", async () => { expect(await render([], [])).toBe(""); });
    test("14 models produce two distinct account rings plus local", async () => { const html = await render([node()]); expect(count(html)).toBe(3); expect(html).toContain("mini6 · su4imauz · codex"); expect(html).toContain("mini6 · NylahKamalii9806 · codex"); expect(html).toContain("17% used"); expect(html).toContain("83% used"); });
    test("disabled and explicit 403 omit stale catalogues", async () => { for (const patch of [{ enabled: false }, { lastError: "models 403: forbidden" }]) expect(count(await render([node(patch)]))).toBe(1); });
    test("shared catalogue omissions and successful empty snapshots are authoritative", async () => { expect(count(await render([node()], [local], {}))).toBe(1); expect(count(await render([node({ catalog: [] })]))).toBe(1); });
    test("transient outage keeps last known usage with stale warning", async () => { const html = await render([node({ lastError: "connection refused" })]); expect(count(html)).toBe(3); expect(html).toContain("17% used (last known)"); expect(html).toContain("stale quota snapshot"); expect(html).not.toContain("sufficient capacity\" aria-label=\"mini6"); });
    test("old usage is stale, absent usage is unknown rather than zero", async () => { expect(await render([node({ usageAt: 1 })], [])).toContain("stale quota snapshot"); const html = await render([node({ usage: null })], []); expect(count(html)).toBe(2); expect(html).toContain("quota unavailable"); expect(html).not.toContain("0% used"); expect(html).not.toContain("stroke-dasharray"); });
    test("node account provider text is HTML escaped", async () => { const n = node({ name: 'mini<6"', catalog: [{ id: "a", provider: 'co<dex', account: 'a"><script>' }], usage: null }); const html = await render([n], []); expect(count(html)).toBe(1); expect(html).toContain("mini&lt;6&quot;"); expect(html).toContain("a&quot;&gt;&lt;script&gt;"); expect(html).not.toContain("<script>"); });
});
