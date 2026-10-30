import { expect, test } from "bun:test";
import portable from "./portable";

const ctx = {} as Context;
for (const [provider, model, message_type] of [
    ["codex", "gpt-5", "codex_compaction"],
    ["claude-code", "claude-opus-5", "anthropic_compaction"],
]) {
    const messages = [{ role: "user", message_type, content: JSON.stringify({ content: "summary", encrypted_content: "opaque" }) }];
    const routes = [`${provider}:${model}`, `${provider}/other:${model}`, `ssh/offline:${provider}/main:${model}`, `hyper/node:${provider}/remote:${model}`];
    test(`${provider}: reuse across direct, offline SSH and Hyper in both directions`, () => {
        for (const producedBy of routes) for (const model of routes) {
            expect(portable(ctx, null, { model, producedBy, messages })).toEqual(messages);
        }
    });
    test(`${provider}: different identities and unresolved aliases do not reuse native blocks`, () => {
        for (const target of [`${provider}:different`, `other:${model}`, `hyper/node:${model}`, `ssh/offline:${model}`, `hyper/node:hyper/other:${model}`]) {
            const result = portable(ctx, null, { model: target, producedBy: routes[0], messages });
            if (provider === "codex") expect(result).toBeNull();
            else expect(result?.[0]?.message_type).toBe("compaction_summary");
        }
        expect(portable(ctx, null, { model: routes[0]!, messages })).not.toEqual(messages);
    });
}
