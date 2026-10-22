import { describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

describe("chat submission idempotency", () => {
  test("concurrent HTTP retries with one request id persist one user turn", async () => {
    const ctx: any = await mkTestCtx();
    const agent = await ctx.fns.agent.start({ model: "mock:test", title: "idempotency" });
    const request = () => new Request(`http://localhost/agent/${agent.id}?debounceSeconds=0`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "hx-request": "true" },
      body: new URLSearchParams({ text: "send exactly once", requestId: "req-123" }),
    });
    const responses = await Promise.all([
      ctx.fns.agent.acceptMessage({ req: request(), params: { id: agent.id } }),
      ctx.fns.agent.acceptMessage({ req: request(), params: { id: agent.id } }),
    ]);
    expect(responses.map((response: Response) => response.status)).toEqual([204, 204]);
    const messages = await ctx.fns.session.getMessages({ id: agent.id });
    expect(messages.filter((message: any) => message.role === "user" && message.content === "send exactly once")).toHaveLength(1);
  });
});
test('stopped plan ignores child wake; accepted human continuation enables subsequent child wake', async () => {
  const ctx: any = await mkTestCtx();
  const agent = await ctx.fns.agent.start({ model: 'mock:test', title: 'human-resume' });
  ctx.state.registry.agent.wakeWorker = () => {};
  await ctx.fns.session.plan({ agent, title: 'work', tasks: [{id:'work',title:'work',instructions:''}] });
  await ctx.fns.agent.stop({ agent, clearQueue: true });
  const row = async () => (await ctx.fns.procs.db.select({sql:'SELECT scratchpad,last_error,next_run_at FROM agents WHERE id=?',params:[agent.id]}))[0];
  const deliver = (key: string) => ctx.fns.session.deliverInbound({id:agent.id,delivery:{key,text:'child completed',author:'agent:child',messageType:'team_update',event:{type:'team_update'},wake:true}});
  await deliver('before-human');
  expect((await row()).next_run_at).toBeNull();
  expect(JSON.parse((await row()).scratchpad).plan.pausedAt).toBeTruthy();
  const req = new Request(`http://localhost/agent/${agent.id}?debounceSeconds=0`, {method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({text:'continue',requestId:'continue-once'})});
  expect((await ctx.fns.agent.acceptMessage({req,params:{id:agent.id}})).status).toBe(200);
  const resumed = await row();
  expect(JSON.parse(resumed.scratchpad).plan.pausedAt).toBeNull();
  expect(JSON.parse(resumed.scratchpad).plan.tasks[0].activeSince).toBeGreaterThan(0);
  expect(resumed.next_run_at).not.toBeNull();
  // Simulate successful queued turn completion without making a provider call.
  await ctx.fns.procs.db.run({sql:'UPDATE agents SET next_run_at=NULL,last_error=NULL WHERE id=?',params:[agent.id]});
  await deliver('after-human');
  expect((await row()).next_run_at).not.toBeNull();
});
