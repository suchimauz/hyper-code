import { describe, expect, test } from "bun:test";
import route from "./$route_minimax_settings_POST";

// The route is exercised with a plain context: it only reads the form, writes
// the admission tier and renders the form again. No database, no provider call.
function makeCtx(stored: Record<string, any>) {
    const ctx: any = { state: {}, env: {}, fns: {
        settings: {
            set: async (o: any) => { stored[o.key] = o.value; },
            getString: async (o: any) => stored[o.key] ?? null,
            getNumber: async (o: any) => stored[o.key] ?? o.fallback ?? null,
        },
        llms: { minimaxSettings: (o: any) => `<form class="llm-minimax-settings" data-tier="${o.serviceTier}"></form>` },
    } };
    return ctx;
}

async function post(body: string, stored: Record<string, any> = {}) {
    const ctx = makeCtx(stored);
    const res = await route(ctx, null, { req: new Request("http://x/llms/minimax/settings", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body }) });
    return { res, stored, html: await res.text() };
}

describe("POST /llms/minimax/settings", () => {
    test("stores only the admission tier and ignores a legacy budget field", async () => {
        const { res, stored, html } = await post("minimaxCodingServiceTier=priority&minimaxCodingMaxTokens=32768");
        expect(res.status).toBe(200);
        expect(stored.minimaxCodingServiceTier).toBe("priority");
        expect(stored.minimaxCodingMaxTokens).toBeUndefined();
        expect(html).toContain('data-tier="priority"');
        expect(html).not.toContain("data-max");
    });

    test("an out-of-range budget is ignored instead of stored", async () => {
        const { stored } = await post("minimaxCodingServiceTier=standard&minimaxCodingMaxTokens=10");
        expect(stored.minimaxCodingMaxTokens).toBeUndefined();
    });

    test("an unknown tier is ignored instead of stored", async () => {
        const { stored } = await post("minimaxCodingServiceTier=gold");
        expect(stored.minimaxCodingServiceTier).toBeUndefined();
    });
});
