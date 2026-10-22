import { test, expect, describe } from "bun:test";
import resolve from "./resolveEndpoint";
import getString from "../settings/getString";
import get from "../settings/get";

// Declarations from src/llm/$setting_*.ts. Tests don't go through the loader,
import resolveSecret from "../secrets/resolve";
import resolveSetting from "../secrets/resolveSetting";
// so we seed ctx.state.settings.registry by hand. Keep in sync with the files.
function makeRegistry() {
    return new Map<string, any>([
        ['llm.lmstudioBaseUrl', { type: 'string', env: 'LMSTUDIO_URL', default: 'http://localhost:1234' }],
        ['llm.openaiApiKey',    { type: 'secret', env: 'OPENAI_API_KEY', default: null }],
        ['llm.kimiApiKey',      { type: 'secret', env: 'KIMI_API_KEY',   default: null }],
        ['llm.groqApiKey',      { type: 'secret', env: 'GROQ_API_KEY',   default: null }],
        ['llm.anthropicApiKey', { type: 'secret', env: 'ANTHROPIC_API_KEY', default: null }],
        ['llm.openrouterApiKey',{ type: 'secret', env: 'OPENROUTER_API_KEY', default: null }],
    ]);
}

// Plain-object ctx (not the injecting Proxy) — fns entries are therefore
// invoked with opts only, so real settings fns are wrapped as (opts) => raw(ctx, null, opts).
const mkCtx = (env: Record<string, string> = {}) => {
    const ctx: any = { env, state: { settings: { registry: makeRegistry() } } };
    ctx.fns = {
        procs: { db: { select: async () => [] } },   // no DB rows in unit-test
        settings: {
            getString: (opts: any) => getString(ctx, null, opts),
            get: (opts: any) => get(ctx, null, opts),
            files: async () => ({ values: {} }),   // no instance settings files in unit-test
        },
        secrets: {
            resolve: (opts: any) => resolveSecret(ctx, null, opts),
            resolveSetting: (opts: any) => resolveSetting(ctx, null, opts),
            // secrets.get = cache + local store over resolve; no DB here, so straight to resolve
            get: (opts: any) => resolveSecret(ctx, null, opts),
        },
    };
    return ctx as unknown as Context;
};

describe("ai.resolveEndpoint", () => {
    test("Z.ai Coding uses the subscription endpoint and its own key setting", async () => {
        const ctx = mkCtx();
        const keys: string[] = [];
        ctx.fns.secrets.resolveSetting = async (opts) => { keys.push(opts.key); return "coding-token"; };
        const r = await resolve(ctx, null, { model: "zai-coding:glm-5.3" });
        expect(r.url).toBe("https://api.z.ai/api/coding/paas/v4/chat/completions");
        expect(r.api).toBe("openai");
        expect(r.kind).toBe("subscription");
        expect(r.apiKey).toBe("coding-token");
        expect(keys).toEqual(["zaiCodingApiKey"]);
    });

    test("MiniMax M Plan uses the Anthropic subscription endpoint and its own key setting", async () => {
        const ctx = mkCtx();
        const keys: string[] = [];
        ctx.fns.secrets.resolveSetting = async (opts) => { keys.push(opts.key); return "m-plan-key"; };
        const r = await resolve(ctx, null, { model: "minimax-coding:MiniMax-M3" });
        expect(r.url).toBe("https://api.minimax.io/anthropic/v1/messages");
        expect(r.api).toBe("anthropic");
        expect(r.kind).toBe("subscription");
        expect(r.apiKey).toBe("m-plan-key");
        expect(keys).toEqual(["minimaxCodingApiKey"]);
    });

    test("One API uses configured root, secret and OpenAI wire format", async () => {
        const ctx = mkCtx();
        ctx.fns.settings.getString = async () => "http://gateway.test/v1/";
        ctx.fns.secrets.resolveSetting = async () => "test-token";
        const r = await resolve(ctx, null, { model: "oneapi:qwen3.8-flash-next" });
        expect(r.url).toBe("http://gateway.test/v1/chat/completions");
        expect(r.modelId).toBe("qwen3.8-flash-next");
        expect(r.api).toBe("openai");
        expect(r.apiKey).toBe("test-token");
    });

    test("One API fails clearly without a configured root", async () => {
        const ctx = mkCtx();
        ctx.fns.settings.getString = async () => null;
        await expect(resolve(ctx, null, { model: "oneapi:test" })).rejects.toThrow("One API is not configured");
    });

    test("no prefix → lmstudio default", async () => {
        const r = await resolve(mkCtx(), null, { model: "some-local/model" });
        expect(r.provider).toBe("lmstudio");
        expect(r.modelId).toBe("some-local/model");
        expect(r.url).toBe("http://localhost:1234/v1/chat/completions");
        expect(r.apiKey).toBeNull();
    });

    test("LMSTUDIO_URL env override", async () => {
        const r = await resolve(mkCtx({ LMSTUDIO_URL: "http://other:5000" }), null, { model: "foo" });
        expect(r.url).toBe("http://other:5000/v1/chat/completions");
    });

    test("kimi: prefix → moonshot endpoint + KIMI_API_KEY", async () => {
        const r = await resolve(mkCtx({ KIMI_API_KEY: "sk-kimi" }), null, { model: "kimi:kimi-k2-turbo-preview" });
        expect(r.provider).toBe("kimi");
        expect(r.modelId).toBe("kimi-k2-turbo-preview");
        expect(r.url).toBe("https://api.moonshot.ai/v1/chat/completions");
        expect(r.apiKey).toBe("sk-kimi");
    });

    test("openai: prefix", async () => {
        const r = await resolve(mkCtx({ OPENAI_API_KEY: "sk-oai" }), null, { model: "openai:gpt-4o-mini" });
        expect(r.modelId).toBe("gpt-4o-mini");
        expect(r.url).toBe("https://api.openai.com/v1/chat/completions");
        expect(r.apiKey).toBe("sk-oai");
    });

    test("unknown provider throws", async () => {
        await expect(resolve(mkCtx(), null, { model: "zzz:model" })).rejects.toThrow(/unknown provider/);
    });

    test("modelId with colon preserved", async () => {
        const r = await resolve(mkCtx(), null, { model: "kimi:some/model:with:colons" });
        expect(r.modelId).toBe("some/model:with:colons");
    });

    test("claude-code: prefix → anthropic /v1/messages, apiKey null (refreshed lazily)", async () => {
        const r = await resolve(mkCtx(), null, { model: "claude-code:claude-opus-4-7" });
        expect(r.provider).toBe("claude-code");
        expect(r.api).toBe("anthropic");
        expect(r.modelId).toBe("claude-opus-4-7");
        expect(r.url).toBe("https://api.anthropic.com/v1/messages");
        expect(r.apiKey).toBeNull();
    });
    test("anthropic-oauth: prefix → managed subscription Anthropic endpoint", async () => {
        const r = await resolve(mkCtx(), null, { model: "anthropic-oauth:claude-sonnet-4-6" });
        expect(r.provider).toBe("anthropic-oauth");
        expect(r.api).toBe("anthropic");
        expect(r.modelId).toBe("claude-sonnet-4-6");
        expect(r.url).toBe("https://api.anthropic.com/v1/messages");
        expect(r.apiKey).toBeNull();
    });

    test("xai: prefix → managed subscription Responses endpoint", async () => {
        const r = await resolve(mkCtx(), null, { model: "xai:grok-4.6" });
        expect(r.provider).toBe("xai");
        expect(r.kind).toBe("subscription");
        expect(r.api).toBe("responses");
        expect(r.modelId).toBe("grok-4.6");
        expect(r.url).toBe("https://api.x.ai/v1/responses");
        expect(r.apiKey).toBeNull();
    });



});
