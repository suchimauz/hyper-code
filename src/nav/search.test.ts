import { expect, test } from "bun:test";
import searchAll from './searchAll';
async function mkTestCtx() {
    const ctx: any = {state:{nav:{}},fns:{nav:{tabs:async()=>({tabs:[]})},procs:{log:{warn:()=>{}}}}};
    ctx.fns.nav.searchAll=(opts:any)=>searchAll(ctx,null,opts);
    return ctx;
}

const reg = (ctx: any, items: Record<string, any>) => {
    ctx.state.nav ??= {};
    ctx.state.nav.search = Object.fromEntries(Object.entries(items).map(([id, def]) => [id, { ...def, id, module: id.split(".")[0], rel: `${id}.ts` }]));
};
const row = (label: string) => ({ id: `t:${label}`, label, href: `/x/${label}` });

test("search asks sources in parallel, groups by source order, isolates failures and honours prefixes", async () => {
    const ctx: any = await mkTestCtx();
    let seen = "";
    reg(ctx, {
        "a.people": { title: "People", prefix: "@", order: 1, search: ({}, _s: any, o: any) => { seen = o.q; return [row(`p-${o.q}`)]; } },
        "b.boom": { title: "Boom", order: 2, search: () => { throw new Error("boom"); } },
        "c.none": { title: "None", order: 3, search: () => [] },
        "d.docs": { title: "Docs", order: 0, search: (_c: any, _s: any, o: any) => [row(`d-${o.q}`), row("d2")].slice(0, o.limit) },
    });
    let r = await ctx.fns.nav.searchAll({ q: "ann", limit: 1 });
    expect(r.groups.map((g: any) => g.id)).toEqual(["d.docs", "a.people", "b.boom", "c.none"]);
    expect(r.groups[0].items.map((i: any) => i.label)).toEqual(["d-ann"]);
    expect(r.groups[2].error).toBe("boom");
    r = await ctx.fns.nav.searchAll({ q: "@ ann" });
    expect(r.groups.map((g: any) => g.id)).toEqual(["a.people"]);
    expect(seen).toBe("ann");
});

test("slow sources settle as data and over-budget sources abort without HTML tokens", async () => {
    const ctx: any = await mkTestCtx();
    let aborted = false;
    reg(ctx, {
        fast: { title: "Fast", search: () => [row("f")] },
        slow: { title: "Slow", search: async () => { await Bun.sleep(20); return [row("s")]; } },
        stuck: { title: "Stuck", search: (_c: any, _s: any, o: any) => new Promise(() => { o.signal.addEventListener("abort", () => { aborted = true; }); }) },
    });
    const r = await ctx.fns.nav.searchAll({ q: "x", inlineMs: 1, timeoutMs: 50 });
    expect(r.groups.map((g: any) => g.id)).toEqual(["fast", "slow", "stuck"]);
    expect(r.groups[1].items[0].label).toBe('s');
    expect(r.groups[2].error).toContain('timed out');
    expect(r.pending).toEqual([]);
    expect(r.html).toBe('');
    expect(aborted).toBe(true);
});
