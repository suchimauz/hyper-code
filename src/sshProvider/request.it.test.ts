// sshProvider.request end to end: a local SOCKS5 listener forwards to a local TLS
// server whose certificate is issued for chatgpt.com by a throwaway CA. The CA is
// trusted only inside a child bun process (NODE_EXTRA_CA_CERTS is read at
// startup), so the production verifier stays untouched. Skipped without openssl.
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const openssl = Bun.which("openssl");
let dir = "";

function sh(args: string[]) {
    const r = Bun.spawnSync(args, { cwd: dir, stdout: "ignore", stderr: "pipe" });
    if (r.exitCode !== 0) throw new Error(`${args[0]} failed: ${r.stderr.toString()}`);
}

beforeAll(() => {
    if (!openssl) return;
    dir = mkdtempSync(join(tmpdir(), "ssh-request-it-"));
    sh([openssl, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.pem", "-days", "1", "-subj", "/CN=mauzcode-test-ca"]);
    sh([openssl, "req", "-newkey", "rsa:2048", "-nodes", "-keyout", "srv.key", "-out", "srv.csr", "-subj", "/CN=chatgpt.com"]);
    writeFileSync(join(dir, "ext"), "subjectAltName=DNS:chatgpt.com\n");
    sh([openssl, "x509", "-req", "-in", "srv.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-out", "srv.pem", "-days", "1", "-extfile", "ext"]);
    writeFileSync(join(dir, "harness.ts"), `
import tls from "node:tls";
import net from "node:net";
import request from ${JSON.stringify(join(import.meta.dir, "request.ts"))};
import policy from ${JSON.stringify(join(import.meta.dir, "policy.ts"))};
const [gapMs, chunks, idleMs, totalMs] = JSON.parse(process.argv[2]);
const server = tls.createServer({ key: await Bun.file(${JSON.stringify(join(dir, "srv.key"))}).text(), cert: await Bun.file(${JSON.stringify(join(dir, "srv.pem"))}).text() }, s => {
  s.once("data", async () => {
    s.write("HTTP/1.1 200 OK\\r\\ncontent-type: text/event-stream\\r\\ntransfer-encoding: chunked\\r\\nconnection: close\\r\\n\\r\\n");
    for (let i = 0; i < chunks; i++) { await Bun.sleep(gapMs); if (s.destroyed) return; const d = "data: " + i + "\\n\\n"; s.write(d.length.toString(16) + "\\r\\n" + d + "\\r\\n"); }
    s.end("0\\r\\n\\r\\n");
  });
});
await new Promise<void>(r => server.listen(0, "127.0.0.1", () => r()));
const target = (server.address() as net.AddressInfo).port;
// Minimal SOCKS5: no auth, CONNECT by domain, always to the local TLS server.
const socks = net.createServer(c => {
  let stage = 0;
  c.on("data", function onData(b) {
    if (stage === 0) { stage = 1; c.write(Buffer.from([5, 0])); return; }
    c.off("data", onData);
    const up = net.connect(target, "127.0.0.1", () => { c.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0])); c.pipe(up); up.pipe(c); });
    up.on("error", () => c.destroy()); c.on("error", () => up.destroy());
  });
});
await new Promise<void>(r => socks.listen(0, "127.0.0.1", () => r()));
const ctx: any = { fns: { sshProvider: { policy: (o: any) => policy(ctx, null, o) } } };
const started = Date.now();
let out: any;
try {
  const res = await request(ctx, null, { provider: "codex", url: "https://chatgpt.com/backend-api/codex/models", proxyPort: (socks.address() as net.AddressInfo).port, idleTimeoutMs: idleMs, timeoutMs: totalMs });
  const text = await res.text();
  out = { ok: true, events: (text.match(/data:/g) ?? []).length, ms: Date.now() - started };
} catch (e) { out = { ok: false, error: (e as Error).message, ms: Date.now() - started }; }
console.log(JSON.stringify(out));
process.exit(0);
`);
});

afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

async function run(gapMs: number, chunks: number, idleMs: number, totalMs: number) {
    const p = Bun.spawn([process.execPath, join(dir, "harness.ts"), JSON.stringify([gapMs, chunks, idleMs, totalMs])], {
        env: { ...process.env, NODE_EXTRA_CA_CERTS: join(dir, "ca.pem") }, stdout: "pipe", stderr: "pipe",
    });
    const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    const line = out.trim().split("\n").pop() ?? "";
    if (!line.startsWith("{")) throw new Error("harness failed: " + err.slice(-500));
    return JSON.parse(line) as { ok: boolean; events?: number; error?: string; ms: number };
}

test.skipIf(!openssl)("a stream that keeps sending outlives its idle deadline several times over", async () => {
    const r = await run(150, 8, 500, 20000);
    expect(r).toMatchObject({ ok: true, events: 8 });
    expect(r.ms).toBeGreaterThan(1000);
}, 30000);

test.skipIf(!openssl)("silence longer than the idle deadline fails the stream with idle deadline", async () => {
    const r = await run(1500, 2, 400, 20000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("idle deadline");
    expect(r.ms).toBeLessThan(1400);
}, 30000);

test.skipIf(!openssl)("the total deadline still bounds a stream that never goes idle", async () => {
    const r = await run(100, 50, 500, 1200);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("request deadline");
}, 30000);
