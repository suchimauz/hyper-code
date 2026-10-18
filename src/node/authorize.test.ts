import { test, expect } from "bun:test";

// Load the unit under test without a cross-project import or a running database.
const source = await Bun.file(new URL("authorize.ts", import.meta.url)).text();
const compiled = new Bun.Transpiler({ loader: "ts" }).transformSync(source).replace("export default", "return");
const authorize = new Function(compiled)();

async function check(ip: string, allow: unknown = [], headers: Record<string, string> = {}, valid = false) {
    let reads = 0, writes = 0;
    const ctx = {
        state: { procs: { http: { server: { server: { requestIP: () => ({ address: ip }) } } } } },
        fns: {
            settings: { get: async () => allow },
            procs: { db: {
                select: async () => { reads++; return valid ? [{ id: "test", name: "test", providers: "codex" }] : []; },
                run: async () => { writes++; },
            } },
        },
    };
    const result = await authorize(ctx, null, { req: new Request("http://localhost/node/v1/models", { headers }) });
    return { status: result.ok ? 200 : result.response.status, reads, writes, result };
}

test("LAN is denied by default and explicit IP still needs a token", async () => {
    expect((await check("192.168.0.164")).status).toBe(403);
    expect((await check("192.168.0.164", ["192.168.0.164"])).status).toBe(401);
    expect((await check("192.168.0.165", ["192.168.0.164"])).status).toBe(403);
    expect((await check("192.168.0.164", ["192.168.0.0/24", "*"])).status).toBe(403);
    expect((await check("192.168.0.164", "192.168.0.164")).status).toBe(403);
    expect((await check("", [""])).status).toBe(403);
});
test("allowed peers cannot bypass token validation, scopes or hop limit", async () => {
    const allow = ["192.168.0.164"];
    expect((await check("192.168.0.164", allow, { authorization: "Bearer fake" })).status).toBe(401);
    const good = await check("::ffff:192.168.0.164", allow, { authorization: "Bearer fixture" }, true);
    expect(good.status).toBe(200);
    expect(good.result.client.providers).toEqual(["codex"]);
    expect(good.writes).toBe(1);
    const loop = await check("192.168.0.164", allow, { "x-hyper-hops": "3", authorization: "Bearer fixture" }, true);
    expect(loop.status).toBe(508);
    expect(loop.reads).toBe(0);
});
test("forwarded headers including empty values are denied on direct LAN", async () => {
    for (const name of ["forwarded", "x-forwarded-for", "x-forwarded-host", "x-real-ip"]) {
        for (const value of ["", "127.0.0.1"]) expect((await check("192.168.0.164", ["192.168.0.164"], { [name]: value })).status).toBe(403);
    }
});
test("existing loopback, tailnet and local hypermesh ingress remain supported", async () => {
    for (const ip of ["127.0.0.1", "::1", "100.64.0.1", "100.127.255.254"]) expect((await check(ip)).status).toBe(401);
    for (const ip of ["100.63.0.1", "100.128.0.1", "10.77.0.2"]) expect((await check(ip)).status).toBe(403);
    expect((await check("127.0.0.1", [], { "x-hn-id": "fixture", "x-forwarded-for": "10.77.0.2" })).status).toBe(401);
    expect((await check("192.168.0.164", ["192.168.0.164"], { "x-hn-id": "fixture", "x-forwarded-for": "10.77.0.2" })).status).toBe(403);
});
