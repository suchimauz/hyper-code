import { expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import { reqCtx } from "../$test";

async function asUser(ctx: any, user: any) { const r: any = reqCtx(ctx); r.session.user = user; return r; }

async function twoUsers() {
    const ctx = await mkTestCtx();
    const nik = await ctx.fns.auth.createUser({ name: "Nikolai Ryzhikov", email: "niquola@health-samurai.io", password: "password-123" });
    const anna = await ctx.fns.auth.createUser({ name: "Anna K", email: "anna@health-samurai.io", password: "password-456" });
    return { ctx, nik, anna, rn: await asUser(ctx, nik), ra: await asUser(ctx, anna) };
}

test("mine / all: owner filter; chats from before users count as the first owner's", async () => {
    const { ctx, nik, anna, rn, ra } = await twoUsers();
    const a1 = await rn.fns.agent.start({ model: "mock:echo", title: "nik chat" }); await rn.fns.session.save({ agent: a1 });
    const a2 = await ra.fns.agent.start({ model: "mock:echo", title: "anna chat" }); await ra.fns.session.save({ agent: a2 });
    await ctx.fns.procs.db.run({ sql: "INSERT INTO agents (id, title, model, system_prompt, scratchpad, created_at, updated_at) VALUES ('old', 'legacy chat', 'mock:echo', '', '{}', 1, 1)" });
    const ids = (list: any[]) => list.map((a) => a.id).sort();
    expect(ids(await ctx.fns.session.list({ owner: nik.id }))).toEqual([a1.id, "old"].sort());
    expect(ids(await ctx.fns.session.list({ owner: anna.id }))).toEqual([a2.id]);
    expect((await ctx.fns.session.list({})).length).toBe(3);
    expect((await ctx.fns.session.list({})).find((a: any) => a.id === a2.id)?.createdBy).toBe(anna.id);
});

test("read state and pins are per person", async () => {
    const { ctx, nik, rn, ra } = await twoUsers();
    const a = await rn.fns.agent.start({ model: "mock:echo" }); await rn.fns.session.save({ agent: a });
    await ctx.fns.session.appendEvent({ id: a.id, event: { type: "assistant", text: "done" } });
    const unread = async (r: any) => (await r.fns.session.list({})).find((x: any) => x.id === a.id).unread;
    expect(await unread(rn)).toBe(1);
    expect(await unread(ra)).toBe(1);
    await rn.fns.auth.markSeen({ agentId: a.id });
    expect(await unread(rn)).toBe(0);
    expect(await unread(ra)).toBe(1); // Anna has not read it

    await ra.fns.auth.setPinned({ agentId: a.id, pinned: true });
    expect((await ra.fns.auth.pinnedIds({})).has(a.id)).toBe(true);
    expect((await rn.fns.auth.pinnedIds({})).has(a.id)).toBe(false);
    // With several users the shared kv keys are no longer written.
    expect((await ctx.fns.procs.db.select({ sql: "SELECT 1 FROM kv WHERE key = ?", params: [`mobile-pin-agent:${a.id}`] })).length).toBe(0);
    void nik;
});

test("single user: read state and pins are also mirrored to the legacy kv keys (rollback-safe)", async () => {
    const ctx = await mkTestCtx();
    const nik = await ctx.fns.auth.createUser({ name: "Nikolai", password: "password-123" });
    const r = await asUser(ctx, nik);
    const a = await r.fns.agent.start({ model: "mock:echo" }); await r.fns.session.save({ agent: a });
    await ctx.fns.session.appendEvent({ id: a.id, event: { type: "assistant", text: "done" } });
    await r.fns.auth.markSeen({ agentId: a.id });
    await r.fns.auth.setPinned({ agentId: a.id, pinned: true });
    const kv = await ctx.fns.procs.db.select({ sql: "SELECT key FROM kv WHERE key IN (?, ?) ORDER BY key", params: [`mobile-pin-agent:${a.id}`, `seen-at:${a.id}`] });
    expect(kv.map((x: any) => x.key)).toEqual([`mobile-pin-agent:${a.id}`, `seen-at:${a.id}`]);
});

test("before the switch (no users): pins and read state use the legacy kv keys only", async () => {
    const ctx = await mkTestCtx();
    const a = await ctx.fns.agent.start({ model: "mock:echo" }); await ctx.fns.session.save({ agent: a });
    await ctx.fns.auth.setPinned({ agentId: a.id, pinned: true });
    expect((await ctx.fns.auth.pinnedIds({})).has(a.id)).toBe(true);
    expect((await ctx.fns.procs.db.select({ sql: "SELECT count(*)::int n FROM user_agent_state" }))[0].n).toBe(0);
});

test("People page: owners only; add person; Google-only member needs Google on", async () => {
    const { ctx, nik, anna } = await twoUsers();
    const cookie = async (u: any) => `${ctx.fns.procs.auth.cookieName({})}=${await ctx.fns.procs.auth.sign({ sub: u.id, name: u.name, role: u.role, days: 1 })}`;
    const asNik = { cookie: await cookie(nik) }, asAnna = { cookie: await cookie(anna) };
    expect((await ctx.fns.procs.http.dispatch({ method: "GET", url: "/auth/users", headers: asAnna })).status).toBe(403);
    const page = await ctx.fns.procs.http.dispatch({ method: "GET", url: "/auth/users", headers: { ...asNik, accept: "application/json" } });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Anna K");

    const csrf = await ctx.fns.auth.csrfToken({ req: new Request("http://localhost/auth/users", { headers: asNik }) });
    const add = async (body: Record<string, string>) => (await ctx.fns.procs.http.dispatch({ method: "POST", url: "/auth/users", headers: { ...asNik, accept: "application/json", "content-type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify(body) })).json();
    expect((await add({ action: "add", name: "Pavel", email: "pavel@health-samurai.io", password: "password-789" })).ok).toContain("Pavel");
    expect((await add({ action: "add", name: "Olga", email: "olga@health-samurai.io" })).error).toContain("Google sign-in is off");
    expect((await ctx.fns.auth.listUsers({})).map((u: any) => u.id)).toContain("pavel");
});

test("fork and delegated child belong to the parent chat's owner, not to whoever triggered them", async () => {
    const { ctx, nik, anna, rn, ra } = await twoUsers();
    const parent = await rn.fns.agent.start({ model: "mock:echo" });
    await rn.fns.session.save({ agent: parent });
    const fork = await ra.fns.session.fork({ id: parent.id, visibility: "team" });
    const [row] = await ctx.fns.procs.db.select({ sql: "SELECT created_by FROM agents WHERE id = ?", params: [fork.id] });
    expect(row.created_by).toBe(nik.id);
    const own = await ra.fns.agent.start({ model: "mock:echo" });
    await ra.fns.session.save({ agent: own });
    const [mine] = await ctx.fns.procs.db.select({ sql: "SELECT created_by FROM agents WHERE id = ?", params: [own.id] });
    expect(mine.created_by).toBe(anna.id);
});
