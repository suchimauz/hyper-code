import { describe, expect, test } from "bun:test";
import load from "./$loader_input";

const definition = () => ({ open() {}, submit() {}, done() {} });
function entry(root: string, name: string, extra: Record<string, unknown> = {}) {
    return { kind: "input", root, rootDir: `/mounted/${root}/src`, abs: `/mounted/${root}/src/shared/$input_${name}.ts`,
        rel: `shared/$input_${name}.ts`, moduleDir: "shared", name, mod: { default: definition() }, ...extra };
}
function fixture(entries: ReturnType<typeof entry>[] = []) {
    return { state: { procs: { boot: { entries } }, input: { kinds: {} as Record<string, any> } },
        fns: { procs: { modules: { list: () => ["core", "alpha", "beta", "alpha-sub"].map(name => ({ name, dir: `/mounted/${name}` })) }, log: { debug() {} } } } };
}
const register = (ctx: ReturnType<typeof fixture>, ...entries: ReturnType<typeof entry>[]) => load(ctx as any, null, { entries });

describe("input declaration ownership", () => {
    test("same-owner hot reload replaces handlers and completion authority", async () => {
        const first = entry("alpha", "alpha-form"); const ctx = fixture([first]);
        await register(ctx, first);
        const next = { ...definition(), completionAuthority: {} };
        await register(ctx, entry("alpha", "alpha-form", { mod: { default: next } }));
        expect(ctx.state.input.kinds["alpha-form"].submit).toBe(next.submit);
        expect(ctx.state.input.kinds["alpha-form"].completionAuthority).toBe(next.completionAuthority);
        expect(ctx.state.input.kinds["alpha-form"].owner).toBe("alpha");
    });
    test("same owner may use a second mounted source root", async () => {
        const ctx = fixture(); await register(ctx, entry("alpha", "alpha-form"));
        await register(ctx, entry("alpha", "alpha-form", { rootDir: "/mounted/alpha/extra", abs: "/mounted/alpha/extra/$input_alpha-form.ts" }));
        expect(ctx.state.input.kinds["alpha-form"].owner).toBe("alpha");
    });
    test("different owners cannot replace even a kind matching both prefixes", async () => {
        const ctx = fixture(); await register(ctx, entry("alpha", "alpha-sub-form"));
        const original = ctx.state.input.kinds["alpha-sub-form"];
        await expect(register(ctx, entry("alpha-sub", "alpha-sub-form"))).rejects.toThrow("already belongs to alpha");
        expect(ctx.state.input.kinds["alpha-sub-form"]).toBe(original);
    });
    test("owner namespace prevents claiming another plugin kind first", async () => {
        await expect(register(fixture(), entry("beta", "alpha-form", { moduleDir: "alpha" }))).rejects.toThrow("owner prefix beta-");
    });
    test("core secret and planning are protected before or after core loads", async () => {
        for (const name of ["secret", "planning-review", "choice", "confirm", "grid"]) {
            const ctx = fixture(); const bad = entry("alpha", name, { moduleDir: "input" });
            await expect(register(ctx, bad)).rejects.toThrow("belongs to core");
            await register(ctx, entry("core", name));
            await expect(register(ctx, bad)).rejects.toThrow("belongs to core");
            expect(ctx.state.input.kinds[name].owner).toBe("core");
        }
    });
    test("source paths must belong to the claimed mounted owner", async () => {
        await expect(register(fixture(), entry("core", "secret", { rootDir: "/mounted/alpha/src" }))).rejects.toThrow("mounted source owner");
        await expect(register(fixture(), entry("alpha", "alpha-form", { abs: "/outside/form.ts" }))).rejects.toThrow("mounted source owner");
    });
    test("metadata-free dev reload resolves trusted absolute boot entry", async () => {
        const original = entry("alpha", "alpha-form"); const ctx = fixture([original]);
        await register(ctx, { ...original, root: undefined, rootDir: undefined } as any);
        expect(ctx.state.input.kinds["alpha-form"].owner).toBe("alpha");
        await expect(register(fixture(), { ...original, root: undefined, rootDir: undefined } as any)).rejects.toThrow("mounted source owner");
    });
    test("legacy registration migrates only with unambiguous source owner", async () => {
        const original = entry("alpha", "alpha-form"); const ctx = fixture([original]);
        ctx.state.input.kinds["alpha-form"] = { ...definition(), rel: original.rel, module: "shared" };
        await register(ctx, original); expect(ctx.state.input.kinds["alpha-form"].owner).toBe("alpha");
        delete ctx.state.input.kinds["alpha-form"].owner;
        ctx.state.procs.boot.entries.push(entry("beta", "alpha-form"));
        await expect(register(ctx, original)).rejects.toThrow("unknown owner");
    });
});
