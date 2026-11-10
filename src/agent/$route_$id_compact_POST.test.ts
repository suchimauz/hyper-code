import { describe, test, expect } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

describe("POST /agent/:id/compact", () => {
  test("dispatches manual compaction", async () => {
    const ctx = await mkTestCtx();
    const agent: any = { id: "a1", model: "test:model", messages: [], events: [], scratchpad: {}, workspaceDir: process.cwd(), systemPrompt: "" };
    (ctx.state as any).agent = { a1: agent };
    ctx.state.registry.agent.compactContext = (_c: any, _s: any, o: any) => ({ status: "compacted", tokensBefore: 10, instructions: o.instructions });
    const body = new FormData(); body.set("instructions", "focus tests");
    const res = await ctx.fns.procs.http.dispatch({ method: "POST", url: "/agent/a1/compact", body });
    // The response returns at once and dismisses the popup; compaction itself runs in the background.
    expect(res.status).toBe(200);
    expect(res.headers.get("hx-trigger")).toBe("mauzcode-popup-close");
    await Bun.sleep(10);

  });

  test("background compaction failure is reported, not swallowed", async () => {
    const ctx = await mkTestCtx();
    const agent: any = { id: "a2", model: "test:model", messages: [], events: [], scratchpad: {}, workspaceDir: process.cwd(), systemPrompt: "" };
    (ctx.state as any).agent = { a2: agent };
    ctx.state.registry.agent.compactContext = () => { throw new Error("compaction already running"); };
    const notified: string[] = [];
    ctx.state.registry.ui.notify = async (o: any) => { notified.push(`${o.level}:${o.message}`); };
    const res = await ctx.fns.procs.http.dispatch({ method: "POST", url: "/agent/a2/compact", body: new FormData() });
    expect(res.status).toBe(200);
    await Bun.sleep(10);
    expect(notified[0]).toContain("compaction already running");
    expect(notified[0]?.startsWith("error:")).toBe(true);
  });
});
