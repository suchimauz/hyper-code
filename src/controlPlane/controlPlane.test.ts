import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkTestCtx } from "../_testCtx.entry";

// Against the real MauzCode Control Plane (sibling repo) with a throwaway DB. Skipped when absent.
const CP = process.env.MAUZCODE_CONTROL_PLANE_DIR ?? `${process.env.HOME}/mauzcode-control-plane`;
const available = existsSync(`${CP}/scripts/e2e-server.ts`);
let cp: { issuer: string; clientId: string; clientSecret: string; admin: string };
let proc: ReturnType<typeof Bun.spawn> | null = null;

beforeAll(async () => {
    if (!available) return;
    proc = Bun.spawn(["bun", `${CP}/scripts/e2e-server.ts`, "http://mauzcode.test"], { stdout: "pipe", stderr: "inherit", cwd: CP });
    const reader = proc.stdout.getReader();
    let buf = "";
    while (!buf.includes("\n")) { const { value, done } = await reader.read(); if (done) break; buf += new TextDecoder().decode(value); }
    cp = JSON.parse(buf.trim().split("\n").pop()!);
});
afterAll(async () => { if (cp) await fetch(cp.admin + "stop").catch(() => {}); proc?.kill(); });

const connected = () => mkTestCtx({ env: { MAUZCODE_OIDC_ISSUER: cp.issuer, MAUZCODE_OIDC_CLIENT_ID: cp.clientId, MAUZCODE_OIDC_CLIENT_SECRET: cp.clientSecret } });

test("not connected: everything is a quiet no-op", async () => {
    const ctx = await mkTestCtx();
    expect(await ctx.fns.controlPlane.token({})).toBeNull();
    expect(await ctx.fns.controlPlane.heartbeat({})).toBeNull();
    expect(await ctx.fns.controlPlane.services({})).toEqual([]);
});

test.skipIf(!available)("service token via client_credentials, cached", async () => {
    const ctx = await connected();
    const a = await ctx.fns.controlPlane.token({});
    expect(a).toBeTruthy();
    expect(await ctx.fns.controlPlane.token({})).toBe(a);
    const claims = JSON.parse(Buffer.from(a!.split(".")[1]!, "base64url").toString());
    expect(claims.scope).toBe("catalog:read catalog:heartbeat");
});

test.skipIf(!available)("heartbeat reports counts (no names, no content) and discovery sees it", async () => {
    const ctx = await connected();
    await ctx.fns.auth.createUser({ name: "Nikolai", password: "password-123" });
    const hb = await ctx.fns.controlPlane.heartbeat({});
    expect(hb?.service).toBe("mauzcode-test");
    const list = await ctx.fns.controlPlane.services({ kind: "mauzcode" });
    const me = list.find((s: any) => s.id === "mauzcode-test");
    expect(me?.lastSeenAt).toBeTruthy();
    expect(me?.metadata.users).toBe(1);
    expect(typeof me?.metadata.agents).toBe("number");
    expect(JSON.stringify(me?.metadata)).not.toContain("Nikolai");
});

test.skipIf(!available)("MauzCode instances page lists registered instances", async () => {
    const ctx = await connected();
    await ctx.fns.controlPlane.heartbeat({});
    const r = await ctx.fns.procs.http.dispatch({ method: "GET", url: "/controlPlane", headers: { accept: "text/html" } });
    const html = await r.text();
    expect(html).toContain("MauzCode instances");
    expect(html).toContain('data-service="mauzcode-test"');
});
