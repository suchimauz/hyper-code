import { test, expect } from "bun:test";
import lease from "./lease";
import refreshOnce from "./refreshOnce";
const viaPool=(ctx:any)=>{if(ctx?.fns?.sshProvider&&!ctx.fns.sshProvider.tunnel)ctx.fns.sshProvider.tunnel=async(o:any)=>{const t=await ctx.fns.codexTunnel.openProduction(o);let done=false;return {port:t.port,signal:t.signal,release:()=>{if(!done){done=true;void t.close()}}}};return ctx};

const tick = () => Bun.sleep(5);
const track = (p: Promise<() => void>) => { const s = { granted: false, release: undefined as undefined | (() => void) }; void p.then(r => { s.granted = true; s.release = r; }); return s; };

test("shared leases of one account are granted together", async () => {
    const ctx: any = { state: {} };
    const a = await lease(ctx, null, { key: "s", mode: "shared" });
    const b = await lease(ctx, null, { key: "s", mode: "shared" });
    const c = await lease(ctx, null, { key: "s", mode: "shared" });
    a(); b(); c();
    expect(ctx.state.sshProviderLocks.size).toBe(0);
});

test("exclusive waits for every running shared lease and blocks later shared ones", async () => {
    const ctx: any = { state: {} };
    const r1 = await lease(ctx, null, { key: "s", mode: "shared" });
    const r2 = await lease(ctx, null, { key: "s", mode: "shared" });
    const ex = track(lease(ctx, null, { key: "s" }));
    const late = track(lease(ctx, null, { key: "s", mode: "shared" }));
    await tick();
    expect(ex.granted).toBe(false);
    r1(); await tick();
    expect(ex.granted).toBe(false);
    r2(); await tick();
    expect(ex.granted).toBe(true);
    expect(late.granted).toBe(false);
    ex.release!(); await tick();
    expect(late.granted).toBe(true);
    late.release!();
});

test("other accounts are independent", async () => {
    const ctx: any = { state: {} };
    const ex = await lease(ctx, null, { key: "a" });
    const other = await lease(ctx, null, { key: "b", mode: "shared" });
    other(); ex();
});

test("a cancelled queued waiter leaves the queue without blocking others", async () => {
    const ctx: any = { state: {} };
    const r = await lease(ctx, null, { key: "s", mode: "shared" });
    const ac = new AbortController();
    const ex = lease(ctx, null, { key: "s", signal: ac.signal });
    const after = track(lease(ctx, null, { key: "s", mode: "shared" }));
    ac.abort();
    await expect(ex).rejects.toThrow("Queued request aborted");
    await tick();
    expect(after.granted).toBe(true);
    after.release!(); r();
    expect(ctx.state.sshProviderLocks.size).toBe(0);
});

test("release is idempotent and an already aborted signal is refused", async () => {
    const ctx: any = { state: {} };
    const r = await lease(ctx, null, { key: "s", mode: "shared" });
    r(); r();
    const ex = await lease(ctx, null, { key: "s" });
    ex();
    const ac = new AbortController(); ac.abort();
    await expect(lease(ctx, null, { key: "s", signal: ac.signal })).rejects.toThrow();
    expect(ctx.state.sshProviderLocks.size).toBe(0);
});

test("a holder from the previous serial lease is waited out after hot reload", async () => {
    let finish!: () => void;
    const ctx: any = { state: { sshProviderTails: new Map([["s", new Promise<void>(r => (finish = r))]]) } };
    const sh = track(lease(ctx, null, { key: "s", mode: "shared" }));
    await tick();
    expect(sh.granted).toBe(false);
    finish(); await tick();
    expect(sh.granted).toBe(true);
    sh.release!();
});

test("concurrent refreshes of one account contact the provider once", async () => {
    let refreshes = 0, finish!: (t: any) => void;
    const fresh = { access: "new", refresh: "r2", expires: Date.now() + 3600000 };
    const ctx: any = { state: {}, fns: { sshProvider: { refresh: () => { refreshes++; return new Promise(r => (finish = r)); } } } };
    const row = { revision: 1, value: { owner: "o", binding: "b", provider: "codex", mode: "socks", tokens: { access: "old", refresh: "r1", expires: 0 } } };
    const store = { read: async () => row, save: async () => 2 };
    const opts = { key: "s", provider: "codex", owner: "o", binding: "b", proxyPort: 1, store };
    const calls = [refreshOnce(ctx, null, opts), refreshOnce(ctx, null, opts), refreshOnce(ctx, null, opts)];
    await tick();
    finish(fresh);
    expect(await Promise.all(calls)).toEqual([fresh, fresh, fresh]);
    expect(refreshes).toBe(1);
    expect(ctx.state.sshProviderRefreshes.size).toBe(0);
});

test("tokens already rotated by another request are reused without a refresh", async () => {
    let refreshes = 0;
    const ctx: any = { state: {}, fns: { sshProvider: { refresh: async () => { refreshes++; } } } };
    const tokens = { access: "rotated", refresh: "r2", expires: Date.now() + 3600000 };
    const store = { read: async () => ({ revision: 3, value: { owner: "o", binding: "b", provider: "codex", mode: "socks", tokens } }), save: async () => 4 };
    expect(await refreshOnce(ctx, null, { key: "s", provider: "codex", owner: "o", binding: "b", proxyPort: 1, store })).toEqual(tokens);
    expect(refreshes).toBe(0);
});

test("a failed refresh is reported to every waiter and not cached", async () => {
    let refreshes = 0;
    const ctx: any = { state: {}, fns: { sshProvider: { refresh: async () => { refreshes++; throw Error("OAuth recovery required"); } } } };
    const store = { read: async () => ({ revision: 1, value: { owner: "o", binding: "b", provider: "codex", mode: "socks", tokens: { access: "a", refresh: "r", expires: 0 } } }), save: async () => 2 };
    const opts = { key: "s", provider: "codex", owner: "o", binding: "b", proxyPort: 1, store };
    const both = await Promise.allSettled([refreshOnce(ctx, null, opts), refreshOnce(ctx, null, opts)]);
    expect(both.map(r => r.status === "rejected" && (r.reason as Error).message)).toEqual(["OAuth recovery required", "OAuth recovery required"]);
    expect(refreshes).toBe(1);
    await expect(refreshOnce(ctx, null, opts)).rejects.toThrow("recovery");
    expect(refreshes).toBe(2);
});

test("a record left in recovery mode is never refreshed", async () => {
    const ctx: any = { state: {}, fns: { sshProvider: { refresh: async () => { throw Error("must not run"); } } } };
    const store = { read: async () => ({ revision: 1, value: { owner: "o", binding: "b", provider: "codex", mode: "recovery", tokens: { access: "a", refresh: "r", expires: 0 } } }), save: async () => 2 };
    await expect(refreshOnce(ctx, null, { key: "s", provider: "codex", owner: "o", binding: "b", proxyPort: 1, store })).rejects.toThrow("unavailable");
});

test("dispatch runs requests of one account in parallel and refreshes expired tokens once", async () => {
    const dispatch = (await import("./dispatch")).default;
    let refreshes = 0, inFlight = 0, peak = 0;
    let record: any = { revision: 1, value: { owner: "o", binding: "pin", provider: "codex", mode: "socks", tokens: { access: "old", refresh: "r1", expires: 0, accountId: "acc" } } };
    const auth: string[] = [];
    const ctx: any = { state: {}, fns: {
        sshProvider: {
            binding: async () => ({ name: "slot", owner: "o", fingerprint: "pin" }),
            lease: (o: any) => lease(ctx, null, o),
            refreshOnce: (o: any) => refreshOnce(ctx, null, o),
            refresh: async (o: any) => {
                refreshes++;
                await o.store.save(o.row.revision, { ...o.row.value, mode: "recovery" });
                await Bun.sleep(20);
                const tokens = { ...o.row.value.tokens, access: "new", refresh: "r2", expires: Date.now() + 3600000 };
                await o.store.save(2, { ...o.row.value, mode: "socks", tokens });
                return tokens;
            },
            policy: () => {},
            request: async (o: any) => { auth.push(o.headers.authorization); inFlight++; peak = Math.max(peak, inFlight); await Bun.sleep(30); inFlight--; return new Response("ok"); },
        },
        codexTunnel: {
            encryptedStore: () => ({ read: async () => record, save: async (revision: number, value: any) => { record = { revision: revision + 1, value }; return record.revision; } }),
            openProduction: async () => ({ port: 9, signal: new AbortController().signal, close: async () => {} }),
            identity: () => {},
        },
    } };
    const ssh = { provider: "codex" as const, instance: "i", account: "a" };
    const bodies = await Promise.all([1, 2, 3].map(async () => (await dispatch(viaPool(ctx), null, { ssh, url: "https://chatgpt.com/backend-api/codex/responses", init: { method: "POST", body: "{}" } })).text()));
    expect(bodies).toEqual(["ok", "ok", "ok"]);
    expect(refreshes).toBe(1);
    expect(peak).toBe(3);
    expect(auth).toEqual(["Bearer new", "Bearer new", "Bearer new"]);
    expect(ctx.state.sshProviderLocks.size).toBe(0);
});
