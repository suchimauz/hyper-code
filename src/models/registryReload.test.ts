// Regression: use the real scanner, boot loader table and injecting procedure proxy,
// not a hand-built registry or a direct call to $loader_modelProvider.
import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { makeCtx } from "../$main";
import load from "../procs/boot/load";

function declaration(label: string, updated = false): string {
    return `export default {
        id: "reload-fixture", label: ${JSON.stringify(label)},
        fields: [{ key: "token", label: "Token", type: "secret", required: true }],
        transports: ${JSON.stringify(updated ? ["direct", "socks"] : ["direct"])},
        test: async () => { throw new Error("Fixture handlers must never run"); },
        actions: { inspect: { label: ${JSON.stringify(updated ? "Inspect again" : "Inspect")},
            run: async () => { throw new Error("Fixture actions must never run"); } } }
    };\n`;
}

test("real boot discovers modelProvider and namespace reload replaces the same owner's declaration", async () => {
    const scratch = resolve(import.meta.dir, "../../.test-tmp");
    await mkdir(scratch, { recursive: true });
    const root = await mkdtemp(join(scratch, "model-provider-reload-"));
    try {
        await Bun.write(join(root, "package.json"), JSON.stringify({ name: "provider-fixture", procs: { path: [], plugins: [], prod: {} } }));
        await Bun.write(join(root, "workspace.json"), JSON.stringify({ pluginRegistry: { version: 1, entries: [] } }));
        const file = join(root, "src/reloadFixture/$modelProvider_reload-fixture.ts");
        await Bun.write(file, declaration("Before reload"));
        const ctx = makeCtx();
        ctx.state.root = root;
        ctx.env = { NODE_ENV: "test", WORKDIR: root, USER_PLUGINS: join(root, "user-plugins"), PROCS_PATH: "", PROCS_PLUGINS: "" };
        await load(ctx, null, { strict: true });
        // Documentation indexing is unrelated to provider reload and requires a DB.
        // Leave scanning, namespace reload and all declaration loaders untouched.
        ctx.state.registry.runtime.docs.index = async () => ({});

        const before = ctx.fns.models.providers({}).filter(provider => provider.id === "reload-fixture");
        expect(before).toEqual([{
            id: "reload-fixture", label: "Before reload",
            fields: [{ key: "token", label: "Token", type: "secret", required: true }],
            transports: ["direct"], actions: [{ name: "inspect", label: "Inspect" }],
        }]);
        const original = ctx.state.models.providers!["reload-fixture"]!;
        expect(original.rel).toBe("reloadFixture/$modelProvider_reload-fixture.ts");
        expect(typeof original.definition.test).toBe("function");

        await Bun.write(file, declaration("After reload", true));
        const reloaded = await ctx.fns.procs.repl.load({ name: "reloadFixture" });
        expect("files" in reloaded ? reloaded.files : []).toContain("reloadFixture/$modelProvider_reload-fixture.ts");
        const after = ctx.fns.models.providers({}).filter(provider => provider.id === "reload-fixture");
        expect(after).toEqual([{
            id: "reload-fixture", label: "After reload",
            fields: [{ key: "token", label: "Token", type: "secret", required: true }],
            transports: ["direct", "socks"], actions: [{ name: "inspect", label: "Inspect again" }],
        }]);
        const replacement = ctx.state.models.providers!["reload-fixture"]!;
        expect(replacement.owner).toBe(original.owner);
        expect(replacement.rel).toBe(original.rel);
        expect(replacement.definition).not.toBe(original.definition);
        expect(JSON.stringify(after)).not.toContain("Fixture handlers");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}, 30_000);
