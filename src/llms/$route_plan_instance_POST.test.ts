import { test, expect } from "bun:test";
import route from "./$route_plan_instance_POST";

const mkReq = (fields: Record<string, string>) =>
    new Request("http://local/llms/plan/instance", { method: "POST", body: new URLSearchParams(fields) });

const mkCtx = (instances: Array<{ name: string; pinned: boolean }>) => {
    const calls: any[] = [];
    const ctx: any = { fns: {
        sshInstance: { list: async () => instances.map((i) => ({ name: i.name, pinnedHostKey: i.pinned ? "k" : null })) },
        settings: { set: async (o: any) => { calls.push(o); } },
        llms: { planInstanceSettings: (o: any) => `<form data-frag="${o.provider}:${o.instance ?? "local"}"></form>` },
    } };
    return { ctx, calls };
};

test("saves a trusted pinned instance and re-renders the fragment", async () => {
    const { ctx, calls } = mkCtx([{ name: "box", pinned: true }, { name: "loose", pinned: false }]);
    const res = await route(ctx, null, { req: mkReq({ provider: "zai-coding", instance: "box" }) });
    expect(calls).toEqual([{ module: "llm", scopeType: "global", key: "zaiCodingInstance", value: "box" }]);
    expect(await res.text()).toContain('data-frag="zai-coding:box"');
});

test("local clears the setting; unpinned, unknown or wrong providers are rejected", async () => {
    const { ctx, calls } = mkCtx([{ name: "box", pinned: true }, { name: "loose", pinned: false }]);
    const res = await route(ctx, null, { req: mkReq({ provider: "minimax-coding", instance: "local" }) });
    expect(calls[0]).toMatchObject({ key: "minimaxCodingInstance", value: "" });
    expect(await res.text()).toContain('data-frag="minimax-coding:local"');
    await expect(route(ctx, null, { req: mkReq({ provider: "codex", instance: "box" }) })).rejects.toThrow();
    await expect(route(ctx, null, { req: mkReq({ provider: "zai-coding", instance: "ghost" }) })).rejects.toThrow();
    await expect(route(ctx, null, { req: mkReq({ provider: "zai-coding", instance: "loose" }) })).rejects.toThrow();
    expect(calls).toHaveLength(1);
});
