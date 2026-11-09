import { expect, test } from "bun:test";

// Minimal procedure loader: exercise real files through the normal opts-only API,
// with chat persistence replaced by a spy. No database or running server required.
async function harness() {
    const calls: Array<{id?: string; svg: string}> = [];
    const ctx = { fns: { icons: {} as Record<string, (opts: any) => Promise<any>>, chat: {
        setIcon: async (opts: {id?: string; svg: string}) => {
            calls.push(opts);
            return { id: opts.id ?? "current-chat", icon: opts.svg };
        },
    } } };
    for (const name of ["search", "get", "set"]) {
        const { default: fn } = await import(new URL(`./${name}.ts`, import.meta.url).href);
        ctx.fns.icons[name] = opts => fn(ctx, null, opts);
    }
    return { ctx, calls };
}

test("exact names, tags, bounds and missing matches", async () => {
    const {ctx} = await harness();
    for (const name of ["shapes", "house", "palette"])
        expect((await ctx.fns.icons.search({query:name}))[0].name).toBe(name);
    expect((await ctx.fns.icons.search({query:"watercolor"})).some((r: {name:string}) => r.name === "palette")).toBe(true);
    expect(await ctx.fns.icons.search({query:""})).toEqual([]);
    expect(await ctx.fns.icons.search({query:"not-an-icon-hyper-xyz"})).toEqual([]);
    expect((await ctx.fns.icons.search({query:"arrow",limit:3})).length).toBe(3);
    for (const limit of [0,31,1.5]) await expect(ctx.fns.icons.search({query:"arrow",limit})).rejects.toThrow();
});

test("SVG retrieval, padding and path validation", async () => {
    const {ctx} = await harness();
    expect((await ctx.fns.icons.get({name:"shapes"})).svg).toContain('viewBox="0 0 24 24"');
    const padded = await ctx.fns.icons.get({name:"shapes",padded:true});
    expect(padded.svg).toContain('viewBox="0 0 32 32"');
    expect(padded.svg).toContain('translate(7 7) scale(0.75)');
    for (const name of ["../package", "SHAPES", "missing-hyper-xyz"])
        await expect(ctx.fns.icons.get({name})).rejects.toThrow();
});

test("set passes padded SVG and target to core persistence", async () => {
    const {ctx,calls} = await harness();
    expect(await ctx.fns.icons.set({name:"palette",id:"test-chat"})).toMatchObject({name:"palette",id:"test-chat"});
    expect(calls[0].svg).toContain('translate(7 7) scale(0.75)');
    expect((await ctx.fns.icons.set({name:"shapes"})).id).toBe("current-chat");
});

test("native catalogue endpoint returns local metadata, not executable HTML", async () => {
    const { default: route } = await import("./$route_catalog_GET.ts");
    const response = await route({} as any, null, { req: new Request("http://localhost/icons/catalog") });
    const rows = await response.json();
    expect(rows.some((row: {name:string}) => row.name === "shapes")).toBe(true);
    expect(response.headers.get("content-type")).toContain("application/json");
});
