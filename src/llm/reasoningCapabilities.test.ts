import { describe, expect, test } from "bun:test";
import capabilities from "./reasoningCapabilities";

describe("llm.reasoningCapabilities xAI", () => {
    test("Grok 4 subscription models expose Responses effort levels", async () => {
        const result = await capabilities({} as Context, null, { model: "xai/work:grok-4.6" });
        expect(result.mode).toBe("openai-effort");
        expect(result.defaultEffort).toBe("medium");
        expect(result.supported).toEqual(["auto", "off", "minimal", "low", "medium", "high", "xhigh"]);
    });
});

describe("llm.reasoningCapabilities gpt-6", () => {
    test("gpt-6 never offers off/minimal and off resolves up to low", async () => {
        const result = await capabilities({} as Context, null, { model: "codex:gpt-6-astra" });
        expect(result.supported).toEqual(["auto", "low", "medium", "high", "xhigh"]);
        const resolve = (await import("./resolveReasoningEffort")).default;
        const ctx = { fns: { llm: { reasoningCapabilities: (o: any) => capabilities({} as Context, null, o) } } } as any;
        const r = await resolve(ctx, null, { model: "codex:gpt-6-astra", effort: "off" });
        expect(r.applied).toBe("low");
        expect(r.downgraded).toBe(true);
    });
});
test('Z.ai GLM-5.3 family offers Low High Max, defaults Max and never Off', async () => {
 for (const id of ['glm-5.3','glm-5.3-flash','glm-5.3-flashx']) {
  const r=await capabilities({} as Context,null,{model:`zai-coding:${id}`});
  expect(r.supported).toEqual(['auto','low','high','xhigh']);expect(r.defaultEffort).toBe('xhigh');
 }
 const old=await capabilities({} as Context,null,{model:'zai-coding:glm-4.5'});expect(old.mode).toBe('none');
});

describe('llm.reasoningCapabilities kimi-coding', () => {
    // The catalogue advertises supports_thinking_type "only", but the live
    // endpoint accepts thinking.type "disabled" and then answers without a
    // thinking block, so Off is offered on every Kimi model.
    test('every Kimi model can turn reasoning off', async () => {
        for (const id of ['kimi-for-coding', 'kimi-for-coding-highspeed', 'k3', 'k3-256k']) {
            const r = await capabilities({} as Context, null, { model: `kimi-coding:${id}` });
            expect(r.supported).toContain('off');
        }
    });

    test('models with think_efforts offer Low High and Max, defaulting to High', async () => {
        for (const id of ['kimi-for-coding', 'k3', 'k3-256k']) {
            const r = await capabilities({} as Context, null, { model: `kimi-coding:${id}` });
            expect(r.supported).toEqual(['auto', 'off', 'low', 'high', 'xhigh']);
            expect(r.defaultEffort).toBe('high');
            expect(r.mode).toBe('anthropic-adaptive');
        }
    });

    // kimi-for-coding-highspeed publishes no think_efforts, so it must not
    // offer levels the catalogue never declared.
    test('the highspeed line offers no effort levels', async () => {
        const r = await capabilities({} as Context, null, { model: 'kimi-coding:kimi-for-coding-highspeed' });
        expect(r.supported).toEqual(['auto', 'off']);
    });

    test('a Kimi SSH route resolves capabilities like the local one', async () => {
        const local = await capabilities({} as Context, null, { model: 'kimi-coding:k3' });
        const remote = await capabilities({} as Context, null, { model: 'ssh/box:kimi-coding/work:k3' });
        expect(remote).toEqual(local);
    });
});
