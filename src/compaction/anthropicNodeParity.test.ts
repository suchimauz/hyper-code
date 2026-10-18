import { describe, expect, test } from "bun:test";
import identity from "./modelIdentity";
import resolve from "./resolve";
import portable from "./portable";
import compact from "../llm/compactAnthropic";

describe("Anthropic native node compaction (mocked)", () => {
    for (const provider of ["anthropic", "claude-code", "anthropic-oauth"]) {
        test(`${provider}: direct and catalog-backed relay select native; unknown fails closed`, async () => {
            const entry = { id: `${provider}/named:claude-test`, provider, account: "named", api: "anthropic" };
            const ctx: any = { state: { compaction: { compactors: { [provider]: { provider }, default: { provider: "default" } } } }, fns: { node: { get: async () => ({ enabled: true, catalog: [entry] }) }, compaction: {} } };
            ctx.fns.compaction.modelIdentity = (o: any) => identity(ctx, null, o);
            for (const model of [entry.id, `hyper/test:${entry.id}`, "hyper/test:claude-test"]) expect(await resolve(ctx, null, { model })).toMatchObject({ provider, fallback: false });
            for (const node of [null, { enabled: false, catalog: [entry] }, { enabled: true, catalog: [entry, entry] }, { enabled: true, catalog: [{ ...entry, account: "wrong" }] }, { enabled: true, catalog: [{ ...entry, api: "openai" }] }]) {
                ctx.fns.node.get = async () => node;
                expect(await resolve(ctx, null, { model: `hyper/test:${entry.id}` })).toMatchObject({ fallback: true });
            }
            ctx.fns.node.get = async () => ({ enabled: true, catalog: [{ id: "unknown/named:claude-test", provider: "unknown", account: "named", api: "anthropic" }] });
            ctx.state.compaction.compactors.unknown = { provider: "unknown" };
            expect(await resolve(ctx, null, { model: "hyper/test:unknown/named:claude-test" })).toMatchObject({ fallback: true });
        });
        test(`${provider}: node payload matches direct; only node bearer is sent`, async () => {
            const original = globalThis.fetch;
            const sent: { headers: Headers; body: any }[] = [];
            const block = { type: "compaction", content: "handoff", signature: "signed-exact", extra: "keep" };
            globalThis.fetch = (async (_url, init) => { sent.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) }); return Response.json({ content: [block], stop_reason: "end_turn", usage: { iterations: [{ type: "compaction", input_tokens: 10, output_tokens: 2 }] } }); }) as typeof fetch;
            try {
                const ctx: any = { env: {}, fns: { llm: { resolveEndpoint: async () => ({ provider, api: "anthropic", apiKey: "direct-token", account: "named", modelId: "claude-test", url: "http://mock" }), refreshClaudeCode: async () => "direct-token", getAnthropicOAuthToken: async () => "direct-token", claudeCodeCliVersion: async () => "test", toAnthropicMessages: ({ messages }: any) => messages } } };
                const opts = { model: `${provider}/named:claude-test`, instructions: "system", focus: "next steps", messages: [{ role: "user", content: "hello" }] };
                expect((await compact(ctx, null, opts)).block).toEqual(block);
                ctx.fns.llm.resolveEndpoint = async () => ({ provider: "hyper", upstream: provider, api: "anthropic", apiKey: "node-token", modelId: opts.model, url: "http://node" });
                ctx.fns.llm.refreshClaudeCode = ctx.fns.llm.getAnthropicOAuthToken = async () => { throw new Error("node must not refresh provider tokens"); };
                expect(await compact(ctx, null, { ...opts, model: `hyper/test:${opts.model}` })).toMatchObject({ block, usage: { prompt_tokens: 10, completion_tokens: 2 } });
                expect(sent[1]!.body).toEqual({ ...sent[0]!.body, model: opts.model });
                expect(sent[1]!.headers.get("authorization")).toBe("Bearer node-token");
                expect(sent[1]!.headers.get("x-api-key")).toBeNull();
                expect(sent[1]!.headers.get("anthropic-beta")).toContain("compact-2026-09-04");
                const messages = [{ role: "user", message_type: "anthropic_compaction", content: JSON.stringify(block) }];
                const route = `hyper/test:${opts.model}`;
                expect(portable(ctx, null, { model: route, producedBy: route, messages })).toEqual(messages);
                expect(portable(ctx, null, { model: opts.model, producedBy: route, messages })![0]).toMatchObject({ message_type: "compaction_summary" });
                ctx.fns.llm.resolveEndpoint = async () => ({ provider: "hyper", upstream: "unknown", api: "anthropic" });
                await expect(compact(ctx, null, opts)).rejects.toThrow("not supported");
                expect(sent).toHaveLength(2);
            } finally { globalThis.fetch = original; }
        });
    }
});
