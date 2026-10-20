import { describe, expect, test } from "bun:test";
import identity from "./modelIdentity";
import contextWindow from "./contextWindow";
import resolve from "./resolve";
import compactCodex from "../llm/compactCodex";
import compactAnthropic from "../llm/compactAnthropic";

function fixture(provider = "codex") {
    const account = { instance: "gpu", provider, account: "work", status: "connected" };
    const ctx: any = { state: { compaction: { compactors: { default: { provider: "default" }, codex: { provider: "codex" }, "claude-code": { provider: "claude-code" } } } }, fns: {
        sshInstance: { get: async () => ({ name: "gpu", pinnedHostKey: "ssh-ed25519 trusted" }) },
        sshAccount: { registry: async () => [account] }, compaction: {}, llm: {},
    }, env: {} };
    ctx.fns.compaction.modelIdentity = (opts: any) => identity(ctx, null, opts);
    return { ctx, account };
}

describe("SSH native compaction", () => {
    test("only connected configured routes receive native identity and context limits", async () => {
        const { ctx, account } = fixture();
        const model = "ssh/gpu:codex/work:gpt-6-astra";
        expect(await identity(ctx, null, { model })).toMatchObject({ provider: "codex", account: "ssh.gpu.work", relay: true, api: "responses" });
        expect(await contextWindow(ctx, null, { model })).toBe(272000);
        expect(await resolve(ctx, null, { model })).toMatchObject({ provider: "codex", fallback: false });
        account.status = "pending";
        expect(await identity(ctx, null, { model })).toBeNull();
        expect(await resolve(ctx, null, { model })).toMatchObject({ fallback: true });
        account.status = "connected";
        ctx.fns.sshInstance.get = async () => ({ name: "gpu", pinnedHostKey: null });
        expect(await identity(ctx, null, { model })).toBeNull();
        ctx.fns.sshInstance.get = async () => { throw new Error("Unknown SSH instance"); };
        expect(await identity(ctx, null, { model })).toBeNull();
    });
    test("malformed, traversal and unsupported remote providers fail closed", async () => {
        const { ctx } = fixture();
        for (const model of ["ssh/gpu:codex/..:gpt-6", "ssh/gpu:codex/.:gpt-6", "ssh/gpu:openai/work:gpt-6", "ssh/gpu:codex/work:gpt:6", "ssh/gpu:gpt-6"]) {
            expect(await identity(ctx, null, { model })).toBeNull();
        }
    });
    test("Codex compaction stays remote and preserves checkpoint protocol", async () => {
        const { ctx } = fixture();
        const ssh = { instance: "gpu", provider: "codex", account: "work" };
        ctx.fns.llm.resolveEndpoint = async () => ({ provider: "codex", api: "responses", account: "ssh.gpu.work", modelId: "gpt-6-astra", url: "https://chatgpt.com/backend-api/codex/responses", apiKey: null, ssh });
        ctx.fns.llm.refreshCodex = async () => { throw new Error("must not read local credentials"); };
        ctx.fns.llm.toCodexInput = () => ({ input: [], instructions: "" });
        ctx.fns.llm.codexCliVersion = async () => "1";
        ctx.fns.llm.parseSSE = async function* () {
            yield { data: JSON.stringify({ type: "response.output_item.done", item: { type: "compaction", encrypted_content: "checkpoint" } }) };
            yield { data: JSON.stringify({ type: "response.completed", response: { id: "r1", usage: { input_tokens: 5, output_tokens: 2 } } }) };
        };
        let called = false;
        ctx.fns.sshAccount.fetch = async (opts: any) => {
            called = true;
            expect(opts.ssh).toBe(ssh);
            expect(opts.init.headers["chatgpt-account-id"]).toBeUndefined();
            expect(JSON.parse(opts.init.body).input).toEqual([{ type: "compaction_trigger" }]);
            return new Response("stream");
        };
        const result = await compactCodex(ctx, null, { model: "ssh/gpu:codex/work:gpt-6-astra", sessionId: "test", instructions: "system", messages: [] });
        expect(called).toBe(true);
        expect(result.item.encrypted_content).toBe("checkpoint");
    });
    test("Claude compaction keeps remote auth and native beta headers", async () => {
        const { ctx } = fixture("claude-code");
        const ssh = { instance: "gpu", provider: "claude-code", account: "work" };
        ctx.fns.llm.resolveEndpoint = async () => ({ provider: "claude-code", api: "anthropic", account: "ssh.gpu.work", modelId: "claude-opus-5", url: "https://api.anthropic.com/v1/messages", apiKey: null, ssh });
        ctx.fns.llm.refreshClaudeCode = async () => { throw new Error("must not read local credentials"); };
        ctx.fns.llm.toAnthropicMessages = () => [];
        ctx.fns.llm.claudeCodeCliVersion = async () => "1";
        ctx.fns.sshAccount.fetch = async (opts: any) => {
            expect(opts.ssh).toBe(ssh);
            expect(opts.init.headers["anthropic-beta"]).toContain("compact-2026-09-04");
            expect(JSON.parse(opts.init.body).system[0].text).toContain("You are Claude Code");
            return Response.json({ content: [{ type: "compaction", content: "summary", signature: "sig" }], stop_reason: "end_turn" });
        };
        const result = await compactAnthropic(ctx, null, { model: "ssh/gpu:claude-code/work:claude-opus-5", messages: [] });
        expect(result.block.signature).toBe("sig");
    });
});
