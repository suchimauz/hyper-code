import { test, expect } from "bun:test";
import tunnel from "./tunnel";
import closeTunnels from "./closeTunnels";

type Fake = { port: number; ac: AbortController; closed: number; instance: string };

/** ctx whose openProduction is controlled by the test: each open waits for `finish()` unless auto. */
function harness(settings: Record<string, number> = {}, auto = true) {
    const opened: Fake[] = [];
    const pending: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
    let port = 1000, inFlight = 0, peakOpens = 0;
    const ctx: any = { state: {}, fns: {
        settings: { getNumber: async (o: any) => settings[o.key] ?? o.fallback },
        codexTunnel: { openProduction: async (o: any) => {
            inFlight++; peakOpens = Math.max(peakOpens, inFlight);
            try {
                if (!auto) await new Promise<void>((resolve, reject) => pending.push({ resolve, reject }));
                const f: Fake = { port: ++port, ac: new AbortController(), closed: 0, instance: o.instance };
                opened.push(f);
                return { port: f.port, signal: f.ac.signal, close: async () => { f.closed++; } };
            } finally { inFlight--; }
        } },
    } };
    const lease = (instance = "i", signal?: AbortSignal) => tunnel(ctx, null, { instance, signal });
    return { ctx, opened, pending, lease, peak: () => peakOpens };
}
const tick = () => Bun.sleep(2);

test("opens lazily and reuses an idle tunnel", async () => {
    const h = harness();
    expect(h.opened.length).toBe(0);
    const a = await h.lease();
    a.release();
    const b = await h.lease();
    expect(b.port).toBe(a.port);
    expect(h.opened.length).toBe(1);
    b.release();
});

test("a busy tunnel is shared while a new one opens, up to maxTunnels per instance", async () => {
    const h = harness({ maxTunnels: 3 });
    const leases = [];
    for (let i = 0; i < 10; i++) { leases.push(await h.lease()); await tick(); }
    expect(h.opened.length).toBe(3);
    const load = new Map<number, number>();
    for (const l of leases) load.set(l.port, (load.get(l.port) ?? 0) + 1);
    // least-loaded sharing keeps the spread even
    expect(Math.max(...load.values()) - Math.min(...load.values())).toBeLessThanOrEqual(2);
    for (const l of leases) l.release();
});

test("limits are counted per instance", async () => {
    const h = harness({ maxTunnels: 1 });
    const a = await h.lease("a"), b = await h.lease("b");
    expect(a.port).not.toBe(b.port);
    expect(h.opened.map(f => f.instance).sort()).toEqual(["a", "b"]);
    const a2 = await h.lease("a");
    expect(a2.port).toBe(a.port);
    a.release(); a2.release(); b.release();
});

test("simultaneous opens are capped by maxConcurrentOpens", async () => {
    const h = harness({ maxTunnels: 10, maxConcurrentOpens: 2 }, false);
    const waiting = Array.from({ length: 6 }, () => h.lease());
    await tick();
    expect(h.pending.length).toBe(2);
    h.pending.splice(0).forEach(p => p.resolve());
    const got = await Promise.all(waiting);
    expect(h.peak()).toBe(2);
    expect(new Set(got.map(g => g.port)).size).toBe(2);
    got.forEach(g => g.release());
});

test("an open failure reaches the waiting request and is not cached", async () => {
    const h = harness({}, false);
    const first = h.lease();
    await tick();
    h.pending.shift()!.reject(Error("SSH readiness timeout"));
    await expect(first).rejects.toThrow("SSH readiness timeout");
    const second = h.lease();
    await tick();
    h.pending.shift()!.resolve();
    const t = await second;
    expect(t.port).toBeGreaterThan(0);
    t.release();
});

test("a tunnel whose ssh exits leaves the pool", async () => {
    const h = harness();
    const a = await h.lease();
    a.release();
    h.opened[0]!.ac.abort();
    await tick();
    const b = await h.lease();
    expect(b.port).not.toBe(a.port);
    expect(h.opened.length).toBe(2);
    b.release();
});

test("a dead busy tunnel is not granted again and closes after release", async () => {
    const h = harness();
    const a = await h.lease();
    h.opened[0]!.ac.abort();
    const b = await h.lease();
    expect(b.port).not.toBe(a.port);
    a.release();
    expect(h.opened[0]!.closed).toBe(1);
    b.release();
});

test("an idle tunnel closes after idleCloseMs; a new lease cancels the timer", async () => {
    const h = harness({ idleCloseMs: 30 });
    const a = await h.lease();
    a.release();
    await Bun.sleep(10);
    const b = await h.lease();
    expect(b.port).toBe(a.port);
    await Bun.sleep(40);
    expect(h.opened[0]!.closed).toBe(0);
    b.release();
    await Bun.sleep(50);
    expect(h.opened[0]!.closed).toBe(1);
    const c = await h.lease();
    expect(c.port).not.toBe(a.port);
    c.release();
});

test("closeTunnels closes idle tunnels now and busy ones after release, without new grants", async () => {
    const h = harness({ maxTunnels: 2 });
    const busy = await h.lease();
    const other = await h.lease();
    await tick();
    other.release();
    expect(h.opened.length).toBe(2);
    expect(await closeTunnels(h.ctx, null, { instance: "i" })).toEqual({ closed: 1, draining: 1 });
    const fresh = await h.lease();
    expect([busy.port, other.port]).not.toContain(fresh.port);
    expect(h.opened.find(f => f.port === busy.port)!.closed).toBe(0);
    busy.release();
    expect(h.opened.find(f => f.port === busy.port)!.closed).toBe(1);
    fresh.release();
    expect(await closeTunnels(h.ctx, null, { instance: "unknown" })).toEqual({ closed: 0, draining: 0 });
});

test("a tunnel finishing its open after closeTunnels is discarded", async () => {
    const h = harness({}, false);
    const waiting = h.lease();
    await tick();
    await closeTunnels(h.ctx, null, { instance: "i" });
    h.pending.shift()!.resolve();
    await tick();
    expect(h.opened[0]!.closed).toBe(1);
    h.pending.shift()?.resolve();
    await tick();
    h.pending.shift()?.resolve();
    const t = await waiting;
    expect(t.port).not.toBe(h.opened[0]!.port);
    t.release();
});

test("cancelling a waiting request does not close the tunnel being opened", async () => {
    const h = harness({}, false);
    const ac = new AbortController();
    const waiting = h.lease("i", ac.signal);
    await tick();
    ac.abort();
    await expect(waiting).rejects.toBeDefined();
    h.pending.shift()!.resolve();
    await tick();
    expect(h.opened[0]!.closed).toBe(0);
    const t = await h.lease();
    expect(t.port).toBe(h.opened[0]!.port);
    t.release();
});

test("release is idempotent", async () => {
    const h = harness({ idleCloseMs: 0, maxTunnels: 1 });
    const a = await h.lease();
    const b = await h.lease();
    expect(b.port).toBe(a.port);
    a.release(); a.release();
    expect(h.opened[0]!.closed).toBe(0);
    b.release();
    expect(h.opened[0]!.closed).toBe(1);
});
