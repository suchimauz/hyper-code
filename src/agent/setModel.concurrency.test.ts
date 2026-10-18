import { expect, test } from "bun:test";
import setModel from "./setModel";

function fixture() {
    const calls: string[] = [];
    const live: any = { model: "mock:old", activeRunCount: 0, abortController: new AbortController() };
    let state = "idle";
    let claimOnUpdate = false;
    let storedModel = "mock:old";
    const ctx: any = { state: { agent: { a: live } }, fns: {
        llm: { resolveEndpoint: async () => ({ kind: "local" }) },
        procs: { db: {
            select: async ({ sql }: any) => sql.includes("WHERE id") ? [{ id: "a", model: storedModel, run_state: state, scratchpad: "{}" }] : [],
            run: async ({ sql, params }: any) => {
                calls.push("update");
                if (claimOnUpdate) state = "running";
                if (sql.includes("run_state = 'idle'") && state !== "idle") return { changes: 0 };
                storedModel = params[0];
                return { changes: 1 };
            },
        } },
        session: { appendEvent: async () => { calls.push("event"); } },
        agent: { unpark: async () => { calls.push("unpark"); }, autoCompactIfNeeded: async () => { calls.push("compact"); } },
        events: { refreshAgentMeta: () => {}, emitAgentsChanged: () => {} },
    } };
    return { ctx, live, calls, state: (s: string) => { state = s; }, race: () => { claimOnUpdate = true; }, model: () => storedModel };
}

for (const kind of ["worker", "direct"] as const) {
    test(`setModel rejects an active ${kind} before any mutation`, async () => {
        const f = fixture();
        if (kind === "worker") f.state("running"); else f.live.activeRunCount = 1;
        await expect(setModel(f.ctx, null, { id: "a", model: "mock:new" })).rejects.toThrow(/running/);
        expect(f.calls).toEqual([]);
        expect(f.live.model).toBe("mock:old");
        expect(f.model()).toBe("mock:old");
    });
}

test("setModel permits idle switch despite stale abortController", async () => {
    const f = fixture();
    const result = await setModel(f.ctx, null, { id: "a", model: "mock:new" });
    expect(result.changed).toEqual(["a"]);
    expect(f.model()).toBe("mock:new");
    expect(f.calls).toEqual(["update", "event", "unpark", "compact"]);
});

test("worker claim between preflight and update cannot mutate live model or unpark", async () => {
    const f = fixture(); f.race();
    await expect(setModel(f.ctx, null, { id: "a", model: "mock:new" })).rejects.toThrow(/running|changed/);
    expect(f.calls).toEqual(["update"]);
    expect(f.live.model).toBe("mock:old");
    expect(f.model()).toBe("mock:old");
});
test("same model is a no-op even while running", async () => {
    const f = fixture(); f.state("running"); f.live.activeRunCount = 1;
    expect((await setModel(f.ctx, null, { id: "a", model: "mock:old" })).changed).toEqual([]);
    expect(f.calls).toEqual([]);
});

test("provider scope preflights every target before the first mutation", async () => {
    const f = fixture();
    f.ctx.fns.procs.db.select = async ({ sql, params }: any) => {
        if (!sql.includes("WHERE id")) return [{ id: "a", model: "mock:old" }, { id: "b", model: "mock:old" }];
        return [{ id: params[0], model: "mock:old", run_state: params[0] === "b" ? "running" : "idle", scratchpad: JSON.stringify({ parked: { provider: "mock", account: "default" } }) }];
    };
    await expect(setModel(f.ctx, null, { id: "a", model: "mock:new", scope: "provider" })).rejects.toThrow(/running/);
    expect(f.calls).toEqual([]);
    expect(f.live.model).toBe("mock:old");
});

test("another model switch between preflight and CAS is not overwritten", async () => {
    const f = fixture();
    f.ctx.fns.procs.db.run = async ({ sql, params }: any) => {
        f.calls.push("update");
        expect(sql.includes("model IS NOT DISTINCT FROM ?")).toBe(true);
        expect(params[3]).toBe("mock:old");
        return { changes: 0 };
    };
    await expect(setModel(f.ctx, null, { id: "a", model: "mock:new" })).rejects.toThrow(/changed/);
    expect(f.calls).toEqual(["update"]);
    expect(f.live.model).toBe("mock:old");
});

