#!/usr/bin/env bun
// Local external-harness client for the live MauzCode runtime.
// Capability calls use the scoped external token; `repl` intentionally uses the
// stronger loopback-only REPL token and may execute arbitrary ctx code.
const argv = process.argv.slice(2);
// Which workspace to talk to. An explicit WORKDIR always wins; otherwise the
// current directory is used only if a MauzCode actually runs there, so calling
// `mauzcode` from anywhere (/tmp, another repo) still reaches the running one
// instead of failing with "no .runtime/port".
const candidates = [
    process.env.WORKDIR,
    process.cwd(),
    await Bun.file(expand("~/.mauzcode/workdir")).text().catch(() => "").then(t => t.trim() || undefined),
    "~/mauzcode",
].filter(Boolean).map(dir => expand(dir as string));

let workdir = "", runtime = "", port = "";
for (const dir of candidates) {
    const found = (await Bun.file(dir + "/.runtime/port").text().catch(() => "")).trim();
    if (!found) continue;
    workdir = dir; runtime = dir + "/.runtime"; port = found;
    break;
}
if (!port) fail(`No .runtime/port in any of: ${candidates.join(", ")} — is MauzCode running?`);
const base = `http://127.0.0.1:${port}`;

const [command, sub, ...rest] = argv;
if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(`Usage:
  mauzcode status
  mauzcode plugin search <English capability query>
  mauzcode plugin read <name>
  mauzcode functions [--namespace <name>] [--limit <n>]
  mauzcode function search <English capability query>
  mauzcode function read <namespace.function>
  mauzcode tools
  mauzcode tool call <name> --json '{...}'
  mauzcode skills mount [--dry-run]
  mauzcode repl '<arbitrary code>'

WORKDIR selects the running MauzCode workspace. JSON is written to stdout.`);
    process.exit(0);
}

if (command === "repl") {
    const token = await secret("external-repl-token");
    const code = [sub, ...rest].filter(Boolean).join(" ") || (!process.stdin.isTTY ? await Bun.stdin.text() : "");
    if (!code) fail("mauzcode repl needs code or stdin");
    await request("/external/repl", { method: "POST", token, body: code, json: false });
} else {
    const token = await secret("external-token");
    if (command === "status") await request("/external/status", { token });
    else if (command === "tools") await request("/external/tools", { token });
    else if (command === "functions") {
        const ns = valueAfter([sub, ...rest], "--namespace");
        const limit = valueAfter([sub, ...rest], "--limit");
        const params = new URLSearchParams();
        if (ns) params.set("namespace", ns);
        if (limit) params.set("limit", limit);
        await request("/external/functions" + (params.size ? `?${params}` : ""), { token });
    } else if (command === "function" && sub === "search") {
        const query = rest.join(" ").trim();
        if (!query) fail("mauzcode function search needs a query");
        await request(`/external/functions?q=${encodeURIComponent(query)}`, { token });
    } else if (command === "function" && sub === "read") {
        const dotted = rest[0] ?? "";
        const cut = dotted.lastIndexOf(".");
        if (cut < 1) fail("mauzcode function read needs namespace.function");
        await request(`/external/functions/${encodeURIComponent(dotted.slice(0, cut))}/${encodeURIComponent(dotted.slice(cut + 1))}`, { token });
    }
    else if (command === "plugin" && sub === "search") {
        const query = rest.join(" ").trim();
        if (!query) fail("mauzcode plugin search needs a query");
        await request("/external/plugins/search", { method: "POST", token, body: JSON.stringify({ query }) });
    } else if (command === "plugin" && sub === "read") {
        if (!rest[0]) fail("mauzcode plugin read needs a name");
        await request(`/external/plugins/${encodeURIComponent(rest[0])}`, { token });
    } else if (command === "tool" && sub === "call") {
        const name = rest[0];
        if (!name) fail("mauzcode tool call needs a tool name");
        const args = await jsonArg(rest.slice(1));
        await request(`/external/tools/${encodeURIComponent(name)}/call`, { method: "POST", token, body: JSON.stringify(args) });
    } else if (command === "skills" && sub === "mount") {
        await request("/external/skills/mount", { method: "POST", token, body: JSON.stringify({ dryRun: rest.includes("--dry-run") }) });
    } else fail(`Unknown command: ${argv.join(" ")}. Run mauzcode help.`);
}

async function jsonArg(args: string[]): Promise<Record<string, any>> {
    const i = args.indexOf("--json");
    let raw = i >= 0 ? args.slice(i + 1).join(" ") : (!process.stdin.isTTY ? await Bun.stdin.text() : "{}");
    if (!raw.trim()) raw = "{}";
    try {
        const value = JSON.parse(raw);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("must be an object");
        return value;
    } catch (error: any) { fail(`Invalid tool JSON: ${error.message}`); }
}

async function secret(name: string): Promise<string> {
    const value = (await Bun.file(`${runtime}/${name}`).text().catch(() => "")).trim();
    if (!value) fail(`No ${runtime}/${name} — reload/start the corresponding MauzCode subsystem`);
    return value;
}

async function request(path: string, opts: { method?: string; token: string; body?: string; json?: boolean }) {
    const res = await fetch(base + path, {
        method: opts.method ?? "GET",
        headers: { authorization: `Bearer ${opts.token}`, ...(opts.json === false ? {} : { "content-type": "application/json" }) },
        body: opts.body,
    });
    const text = await res.text();
    let value: any = text;
    try { value = JSON.parse(text); } catch {}
    console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
    if (!res.ok || value?.error) process.exit(1);
}

function valueAfter(args: Array<string | undefined>, flag: string): string | undefined { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; }
function expand(path: string): string { return path.startsWith("~/") ? (process.env.HOME ?? "") + path.slice(1) : path; }
function fail(message: string): never { console.error(message); process.exit(1); }
