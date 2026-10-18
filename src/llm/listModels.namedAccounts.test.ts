import { test, expect } from "bun:test";

async function load(path: string, fetcher?: typeof fetch) {
    const source = await Bun.file(new URL(path, import.meta.url)).text();
    const code = new Bun.Transpiler({ loader: "ts" }).transformSync(source).replace("export default", "return");
    return new Function("fetch", code)(fetcher);
}

test("named-only Codex catalogue retains account through node catalogue and upstream", async () => {
    const refreshed: string[] = [];
    const payload = Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "fixture-account" } })).toString("base64url");
    const token = `fixture.${payload}.fixture`;
    const fetcher = (async (url: string) => url.includes("/codex/models")
        ? Response.json({ models: [{ slug: "visible" }, { slug: "hidden", visibility: "hidden" }, { slug: "no-api", supported_in_api: false }] })
        : new Response(null, { status: 503 })) as typeof fetch;
    const list = await load("listModels.ts", fetcher);
    const catalog = await load("../node/catalog.ts");
    const upstream = await load("../node/upstream.ts");
    const ctx: any = { env: {}, fns: { llm: {
        accountRegistry: async () => [
            { provider: "codex", account: "broken", status: "connected" },
            { provider: "codex", account: "named", status: "connected" },
            { provider: "codex", account: "pending", status: "pending" },
        ],
        refreshCodex: async ({ account }: { account: string }) => {
            refreshed.push(account);
            if (account === "broken") throw new Error("fixture unavailable");
            return account === "named" ? token : null;
        },
        codexCliVersion: async () => "fixture",
        resolveEndpoint: async ({ model }: { model: string }) => {
            if (!model.startsWith("codex/named:")) throw new Error("not configured");
            return { provider: "codex", api: "responses", kind: "subscription", apiKey: token, url: "https://example.test/responses" };
        },
    }, node: { list: async () => [] } } };
    ctx.fns.llm.listModels = async () => list(ctx, null, { skipNodes: true });
    const result = await ctx.fns.llm.listModels();
    expect(result).toEqual({ "codex/named": ["codex/named:visible"] });
    expect(refreshed).toEqual(["default", "broken", "named"]);
    const entries = await catalog(ctx, null, { providers: ["codex"] });
    expect(entries).toEqual([{ id: "visible", api: "responses", provider: "codex", account: "named", kind: "subscription" }]);
    const route = await upstream(ctx, null, entries[0]);
    expect(route.url).toBe("https://example.test/responses");
    expect(refreshed.at(-1)).toBe("named");
    expect(route.headers["chatgpt-account-id"]).toBe("fixture-account");
});
