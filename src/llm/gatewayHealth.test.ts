import { test, expect } from "bun:test";
import health from "./gatewayHealth";

function context(key: string | null = "test-key", disabled = false): any {
    return { state: {}, fns: { llm: { resolveEndpoint: async () => {
        if (disabled) throw new Error("disabled");
        return { url: "https://gateway.invalid/v1/chat/completions", apiKey: key };
    } } } };
}

test("disabled and missing-key configurations never fetch", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => { calls++; throw new Error("not expected"); }) as any;
    try {
        expect((await health(context(null, true), null, {})).reason).toBe("disabled");
        expect((await health(context(null), null, {})).reason).toBe("missing-key");
        expect(calls).toBe(0);
    } finally { globalThis.fetch = original; }
});

test("models success uses fixed read-only URL, denies redirects and caches result", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async (url: string, opts: RequestInit) => {
        calls++; expect(url).toBe("https://gateway.invalid/v1/models");
        expect(opts.redirect).toBe("manual");
        expect(opts.method).toBeUndefined();
        return Response.json({ data: [{ id: "qwen" }] });
    }) as any;
    try {
        const ctx = context();
        expect((await health(ctx, null, {})).status).toBe("available");
        expect((await health(ctx, null, {})).models).toEqual(["qwen"]);
        expect(calls).toBe(1);
    } finally { globalThis.fetch = original; }
});

test("401, redirects and network/timeout errors never expose credentials", async () => {
    const original = globalThis.fetch;
    try {
        for (const status of [401, 302]) {
            globalThis.fetch = (async () => new Response("secret body", { status })) as any;
            const result = await health(context(), null, {});
            expect(result.status).toBe("unavailable");
            expect(JSON.stringify(result)).not.toContain("secret body");
        }
        globalThis.fetch = (async () => { throw new DOMException("test-key", "TimeoutError"); }) as any;
        expect(await health(context(), null, {})).toMatchObject({ status: "unavailable", reason: "timeout-or-network" });
    } finally { globalThis.fetch = original; }
});

test("malformed and oversized model catalogues remain unknown", async () => {
    const original = globalThis.fetch;
    try {
        for (const body of ["not-json", "x".repeat(262145), "null"]) {
            globalThis.fetch = (async () => new Response(body)) as any;
            expect((await health(context(), null, {})).status).toBe("unknown");
        }
    } finally { globalThis.fetch = original; }
});
