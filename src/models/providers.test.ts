import { describe, expect, test } from "bun:test";
import load from "./$loader_modelProvider";
import providers from "./providers";
import classify from "../procs/project/classify";

const definition = (id = "acme"): types.models.ProviderDefinition => ({
    id, label: "Acme", description: "Fixture provider", icon: "Boxes",
    fields: [
        { key: "baseUrl", label: "Base URL", type: "url", required: true, default: "https://example.invalid" },
        { key: "apiKey", label: "API key", type: "secret", required: true },
    ],
    transports: ["direct"],
    test: async () => ({ status: "configured", reason: "fixture", message: "Fixture only", checkedAt: 1 }),
});
function entry(root = "alpha", name = "acme", def = definition(name)) {
    return { kind: "modelProvider", root, rootDir: `/mounted/${root}/src`, abs: `/mounted/${root}/src/shared/$modelProvider_${name}.ts`,
        rel: `shared/$modelProvider_${name}.ts`, moduleDir: "shared", name, mod: { default: def } };
}
function fixture(entries: ReturnType<typeof entry>[] = []) {
    return { state: { models: {} as types.models.State, procs: { boot: { entries } } },
        fns: { procs: { modules: { list: () => ["core", "alpha", "beta"].map(name => ({ name, dir: `/mounted/${name}` })) }, log: { debug() {} } } } };
}
const register = (ctx: ReturnType<typeof fixture>, ...entries: Parameters<typeof load>[2]["entries"]) => load(ctx as unknown as Context, null, { entries });
const catalogue = (ctx: ReturnType<typeof fixture>) => providers(ctx as unknown as Context, null, {});

describe("model provider SDK and registry", () => {
    test("camelCase declarations are classified as kinds, not runtime functions", () => {
        const ctx = {} as Context;
        expect(classify(ctx, null, { rel: "models/$modelProvider_custom.ts" })).toMatchObject({ kind: "modelProvider", name: "custom" });
        expect(classify(ctx, null, { rel: "models/$loader_modelProvider.ts" })).toMatchObject({ kind: "loader", loaderKind: "modelProvider" });
    });
    test("minimal provider registers for any mounted owner without an owner prefix", async () => {
        for (const owner of ["core", "alpha", "beta"]) {
            const ctx = fixture(); await register(ctx, entry(owner));
            expect(ctx.state.models.providers?.acme?.owner).toBe(owner);
            expect(catalogue(ctx)).toEqual([{ id: "acme", label: "Acme", description: "Fixture provider", icon: "Boxes", fields: definition().fields, transports: ["direct"], actions: [] }]);
        }
    });
    test("invalid ids identify the file and leave existing providers unchanged", async () => {
        const ctx = fixture(); await register(ctx, entry()); const old = catalogue(ctx);
        for (const id of ["Acme", "acme_foo", "-acme", "acme-", "acme--foo", "", "__proto__"]) {
            const bad = entry("alpha", id);
            await expect(register(ctx, bad)).rejects.toThrow(bad.rel);
            expect(catalogue(ctx)).toEqual(old);
        }
        await register(ctx, entry("alpha", "acme-2"));
        expect(catalogue(ctx)).toHaveLength(2);
    });
    test("missing test and filename mismatch are rejected atomically", async () => {
        const ctx = fixture(); await register(ctx, entry()); const before = ctx.state.models.providers?.acme;
        await expect(register(ctx, entry("alpha", "acme", { ...definition(), test: undefined } as unknown as types.models.ProviderDefinition))).rejects.toThrow("requires a test");
        await expect(register(ctx, entry("alpha", "acme", definition("other")))).rejects.toThrow("match its filename");
        expect(ctx.state.models.providers?.acme).toBe(before);
    });
    test("foreign ownership cannot replace even in the same module path", async () => {
        const ctx = fixture(); await register(ctx, entry()); const before = ctx.state.models.providers?.acme;
        await expect(register(ctx, entry("beta"))).rejects.toThrow("already belongs to alpha");
        expect(ctx.state.models.providers?.acme).toBe(before);
    });
    test("custom is protected before and after core registers it", async () => {
        const ctx = fixture();
        await expect(register(ctx, entry("alpha", "custom"))).rejects.toThrow("belongs to core");
        await register(ctx, entry("core", "custom")); const before = ctx.state.models.providers?.custom;
        await expect(register(ctx, entry("alpha", "custom"))).rejects.toThrow("belongs to core");
        expect(ctx.state.models.providers?.custom).toBe(before);
    });
    test("same owner reload replaces definition and supports multiple source roots", async () => {
        const ctx = fixture(); await register(ctx, entry());
        const next = { ...definition(), label: "Updated" };
        await register(ctx, { ...entry("alpha", "acme", next), rootDir: "/mounted/alpha/extra", abs: "/mounted/alpha/extra/$modelProvider_acme.ts" });
        expect(ctx.state.models.providers?.acme?.definition).toBe(next);
        expect(catalogue(ctx)[0]?.label).toBe("Updated");
    });
    test("mounted ownership rejects spoofed roots, path escapes and unknown roots", async () => {
        for (const bad of [entry("unknown"), { ...entry(), rootDir: "/mounted/beta/src" }, { ...entry(), abs: "/outside/provider.ts" }, { ...entry(), rootDir: "/mounted/alpha-suffix", abs: "/mounted/alpha-suffix/provider.ts" }]) {
            await expect(register(fixture(), bad)).rejects.toThrow("mounted source owner");
        }
    });
    test("metadata-free reload requires matching trusted boot entry", async () => {
        const original = entry(); const stripped = { ...original, root: undefined, rootDir: undefined };
        const ctx = fixture([original]); await register(ctx, stripped);
        expect(ctx.state.models.providers?.acme?.owner).toBe("alpha");
        await expect(register(fixture(), stripped)).rejects.toThrow("mounted source owner");
    });
    test("invalid schemas, secret defaults and optional operations are rejected", async () => {
        const invalid: Record<string, unknown>[] = [
            { fields: null }, { label: " " }, { fields: [{ key: "x", label: "X", type: "unsupported" }] },
            { fields: [{ key: "apiKey", label: "API key", type: "secret", default: "do-not-leak" }] },
            { fields: [{ key: "x", label: "X", type: "number", default: "1" }] },
            { fields: [{ key: "x", label: "X", type: "select", options: [] }] },
            { fields: [{ key: "x", label: "X", type: "select", options: [{ value: "a", label: "A" }], default: "b" }] },
            { fields: [definition().fields[0], definition().fields[0]] },
            { transports: [] }, { transports: ["unknown"] }, { transports: ["direct", "direct"] },
            { usage: true }, { listModels: [] }, { validate: "no" }, { actions: { login: { label: "Login" } } },
        ];
        for (const patch of invalid) await expect(register(fixture(), entry("alpha", "acme", { ...definition(), ...patch } as types.models.ProviderDefinition))).rejects.toThrow();
    });
    test("catalogue projects safe metadata only and clones nested arrays", async () => {
        const ctx = fixture(); const def = definition();
        def.fields.push({ key: "mode", label: "Mode", type: "select", options: [{ value: "a", label: "A" }], default: "a" },
            { key: "limit", label: "Limit", type: "number", default: 1 }, { key: "enabled", label: "Enabled", type: "boolean", default: true });
        def.actions = { login: { label: "Log in", run: async () => null } };
        await register(ctx, entry("alpha", "acme", def));
        // Unexpected internal properties must not be spread into the public catalogue.
        Object.assign(def, { credential: "do-not-leak", secretRef: "secret://models/fixture.apiKey" });
        Object.assign(def.fields[1]!, { default: "do-not-leak", value: "do-not-leak", secretRef: "secret://models/fixture.apiKey" });
        Object.assign(def.fields[2]!, { internal: "do-not-leak" });
        const result = catalogue(ctx); const text = JSON.stringify(result);
        expect(text).not.toMatch(/do-not-leak|secret:\/\/|"owner"|"definition"|"run"|"test"/);
        expect(result[0]?.actions).toEqual([{ name: "login", label: "Log in" }]);
        expect(result[0]).not.toHaveProperty("test");
        result[0]!.transports.push("socks");
        const select = result[0]!.fields[2]!;
        if (select.type === "select") select.options[0]!.label = "Mutated";
        expect(def.transports).toEqual(["direct"]);
        const original = def.fields[2]!;
        if (original.type === "select") expect(original.options[0]!.label).toBe("A");
    });
    test("documented minimal provider matches the registered test fixture", async () => {
        const doc = await Bun.file(new URL("../../docs/models-providers.md", import.meta.url)).text();
        const example = doc.match(/```ts\n([\s\S]*?)\n```/)?.[1];
        expect(example).toBeDefined();
        const js = new Bun.Transpiler({ loader: "ts" }).transformSync(example!);
        const module = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
        const ctx = fixture(); await register(ctx, entry("alpha", "acme", module.default));
        const expected = fixture(); await register(expected, entry());
        expect(catalogue(ctx)).toEqual(catalogue(expected));
        expect(await module.default.test()).toEqual(await definition().test({} as Context, {} as types.models.ResolvedConnection));
    });
    test("catalogue is empty before registration and sorted by provider id", async () => {
        const ctx = fixture(); expect(catalogue(ctx)).toEqual([]);
        await register(ctx, entry("alpha", "zebra"), entry("alpha", "acme"));
        expect(catalogue(ctx).map(p => p.id)).toEqual(["acme", "zebra"]);
    });
});
