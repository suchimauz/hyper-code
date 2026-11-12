import { describe, expect, test } from "bun:test";
import page from "./$route__GET";
import suggest from "./$route_suggest_POST";
import parseModelRouteFn from "../llm/parseModelRoute";

describe("autotext sandbox", () => {
    test("redirects to native utilities", async () => {
        const result = await page({} as any, null, { req: new Request("http://localhost/autotext"), params: {} });
        expect(result.status).toBe(302);
        expect(result.headers.get('Location')).toBe('/?view=extension:utilities/autotext');
    });
    test("rewrite endpoint validates the tail and returns structured replacement", async () => {
        const ctx = { fns: { auth: { verifyCsrf: async () => true }, llm: { parseModelRoute: (o: any) => parseModelRouteFn({} as any, null, o), call: async (opts: any) => {
            expect(opts.system).toContain("fixing spelling");
            return { text: JSON.stringify({ text: "Вторая фраза закончена." }), model: opts.model };
        } } } } as any;
        const data = { model: "groq:qwen/qwen3.8-27b", before: "Первая фраза. Сегонд фрза", after: "", rewrite: true, tail: "Сегонд фрза" };
        const req = new Request("http://localhost/autotext/suggest", { method: "POST", body: JSON.stringify(data) });
        const res = await suggest(ctx, null, { req });
        expect(res.status).toBe(200);
        expect(await res.json() as any).toMatchObject({ text: "Вторая фраза закончена.", replaceChars: data.tail.length });
        const invalid = new Request("http://localhost/autotext/suggest", { method: "POST", body: JSON.stringify({ ...data, tail: "другая фраза" }) });
        expect((await suggest(ctx, null, { req: invalid })).status).toBe(400);
    });
    test("rejects unlisted model without invoking the provider", async () => {
        const ctx = { fns: { auth: { verifyCsrf: async () => true }, llm: { parseModelRoute: (o: any) => parseModelRouteFn({} as any, null, o), call: () => { throw new Error("called provider"); } } } } as any;
        const req = new Request("http://localhost/autotext/suggest", { method: "POST", body: JSON.stringify({ model: "evil", before: "hello", after: "" }) });
        const res = await suggest(ctx, null, { req });
        expect(res.status).toBe(400);
        expect((await res.json() as any).error).toBe("Unsupported model");
    });
    test("routes selected Groq model to the same bounded provider call", async () => {
        const ctx = { fns: { auth: { verifyCsrf: async () => true }, llm: { parseModelRoute: (o: any) => parseModelRouteFn({} as any, null, o), call: async (opts: any) => {
            expect(opts.model).toBe("groq/default:openai/gpt-oss-20b");
            expect(opts.noFallback).toBe(true);
            expect(opts.max_tokens).toBe(240);
            expect(opts.groqReasoningEffort).toBe("low");
            return { text: " мир", model: opts.model };
        } } } } as any;
        const req = new Request("http://localhost/autotext/suggest", { method: "POST", body: JSON.stringify({ model: "groq:openai/gpt-oss-20b", before: "Привет", after: "" }) });
        const res = await suggest(ctx, null, { req });
        expect(res.status).toBe(200);
        expect((await res.json() as any).text).toBe(" мир");
    });
    test("GLM Flash uses OpenRouter with low reasoning budget", async () => {
        const ctx = { fns: { auth: { verifyCsrf: async () => true }, llm: { parseModelRoute: (o: any) => parseModelRouteFn({} as any, null, o), call: async (opts: any) => {
            expect(opts.model).toBe("openrouter/default:z-ai/glm-5.3-flash");
            expect(opts.openrouterReasoningEffort).toBe("low");
            expect(opts.max_tokens).toBe(300);
            return { text: " светятся фонари.", model: opts.model };
        } } } } as any;
        const req = new Request("http://localhost/autotext/suggest", { method: "POST", body: JSON.stringify({ model: "openrouter:z-ai/glm-5.3-flash", before: "Вечером", after: "" }) });
        const res = await suggest(ctx, null, { req });
        expect(res.status).toBe(200);
        expect((await res.json() as any).text).toBe(" светятся фонари.");
    });
    test("returns model output and elapsed time", async () => {
        const ctx = { fns: { auth: { verifyCsrf: async () => true }, llm: { parseModelRoute: (o: any) => parseModelRouteFn({} as any, null, o), call: async (opts: any) => {
            expect(opts.noFallback).toBe(true);
            expect(opts.max_tokens).toBe(120);
            return { text: " продолжение", model: opts.model };
        } } } } as any;
        const req = new Request("http://localhost/autotext/suggest", { method: "POST", body: JSON.stringify({ model: "codex:gpt-6-luna", before: "Это статья", after: " дальше" }) });
        const res = await suggest(ctx, null, { req });
        expect(res.status).toBe(200);
        const body: any = await res.json();
        expect(body.text).toBe(" продолжение");
        expect(body.ms).toBeGreaterThanOrEqual(0);
    });
    test("suppresses NO_SUGGESTION without losing ordinary whitespace", async () => {
        const ctx = { fns: { auth: { verifyCsrf: async () => true }, llm: { parseModelRoute: (o: any) => parseModelRouteFn({} as any, null, o), call: async () => ({ text: " NO_SUGGESTION ", model: "codex:gpt-6-luna" }) } } } as any;
        const req = new Request("http://localhost/autotext/suggest", { method: "POST", body: JSON.stringify({ model: "codex:gpt-6-luna", before: "Это статья", after: "" }) });
        const res = await suggest(ctx, null, { req });
        expect((await res.json() as any).text).toBe("");
    });
});
