import { lstatSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
// Kimi Coding authorization: the same OAuth device flow, with the granted
// credential written either to the local isolated slot
// (~/.hyper/accounts/kimi-coding/<account>/kimi-code.json) or, when an SSH
// instance is chosen, straight to that host's slot
// (~/.hyper/ssh-accounts/kimi-coding/<account>/kimi-code.json) over the pinned
// connection — the content travels on stdin, never in argv. No CLI is ever
// executed and no token is returned to the caller.
const KIMI_CLIENT_ID = "17e5f671-d194-4dfb-9706-5516cb48c098";

/**
 * Start Kimi device authorization and store the granted credential locally or on a trusted SSH instance.
 *
 * Runs the in-house auth.kimi.com device flow from this machine; once the person
 * completes authorization, the token JSON is written 0600 to the isolated slot —
 * piped over the pinned connection when `instance` is set, so nothing is stored
 * locally — and the secret-free registry row becomes connected. Returns only
 * public flow hints (verification URL, user code); tokens never appear in the
 * result.
 *
 * @param opts.account Isolated account slot name; never "default".
 * @param opts.instance Trusted configured SSH instance name; omitted writes the credential locally.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Isolated account slot name. */
        account: string;
        /** Trusted configured SSH instance name; omitted writes the credential locally. */
        instance?: string;
    },
): Promise<{ id: string }> {
    await ctx.fns.sshAccount.requireOwner({});
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,39}$/.test(opts.account) || opts.account === "default") throw new Error("Invalid Kimi account");
    if (opts.instance && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(opts.instance)) throw new Error("Invalid instance name");
    const connection = opts.instance ? await ctx.fns.sshInstance.connection({ name: opts.instance }) : null;
    const state = (ctx.state as any).sshAccount ??= {};
    const flows: Map<string, any> = state.flows ??= new Map();
    for (const previous of flows.values()) if ((previous.instance ?? null) === (opts.instance ?? null) && previous.provider === "kimi-coding" && previous.account === opts.account && previous.status === "pending") throw new Error("Authorization already running");
    for (const [key, value] of flows) if (value.expiresAt < Date.now() - 600_000) flows.delete(key);

    const host = ctx.env.KIMI_CODE_OAUTH_HOST ?? "https://auth.kimi.com";
    const headers = {
        "content-type": "application/x-www-form-urlencoded",
        "X-Msh-Platform": "hyper-code2",
        "X-Msh-Version": "0.1",
        "X-Msh-Device-Id": "hyper-code2",
    };
    let data: any;
    try {
        const res = await fetch(`${host}/api/oauth/device_authorization`, { method: "POST", headers, body: new URLSearchParams({ client_id: KIMI_CLIENT_ID }) });
        if (!res.ok) throw new Error(`device_authorization ${res.status}: ${(await res.text()).slice(0, 200)}`);
        data = await res.json();
    } catch (error: any) {
        throw new Error(`Kimi device authorization could not start: ${error?.message ?? String(error)}`);
    }

    const id = crypto.randomUUID();
    const flow: any = {
        id, instance: opts.instance ?? null, provider: "kimi-coding", account: opts.account,
        status: "pending", verificationUri: data.verification_uri_complete ?? data.verification_uri ?? null,
        userCode: data.user_code ?? null, error: null, expiresAt: Date.now() + 600_000, process: null,
        deviceCode: data.device_code, interval: data.interval ?? 5,
        tokenExpiresAt: Math.floor(Date.now() / 1000) + (data.expires_in ?? 600),
    };
    flows.set(id, flow);
    if (opts.instance) await ctx.fns.sshAccount.registry({ action: "begin", instance: opts.instance, provider: "kimi-coding", account: opts.account });
    ctx.fns.procs.events.refresh({ topic: "ssh-accounts", reason: "kimi login started" });

    // Poller: on grant, push the credential JSON to the remote slot via stdin.
    (async () => {
        while (flow.status === "pending") {
            const left = flow.tokenExpiresAt - Math.floor(Date.now() / 1000);
            if (left <= 0) { flow.status = "failed"; flow.error = "device code expired"; break; }
            await Bun.sleep((flow.interval ?? 5) * 1000);
            if (flow.status !== "pending") break;
            let tokenData: any = {};
            try {
                const res = await fetch(`${host}/api/oauth/token`, {
                    method: "POST", headers,
                    body: new URLSearchParams({ client_id: KIMI_CLIENT_ID, grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: flow.deviceCode }),
                });
                tokenData = await res.json().catch(() => ({}));
                if (res.ok && tokenData.access_token) {
                    const payload = JSON.stringify({
                        access_token: tokenData.access_token,
                        refresh_token: tokenData.refresh_token,
                        expires_at: typeof tokenData.expires_at === "number" ? tokenData.expires_at : Math.floor(Date.now() / 1000) + (tokenData.expires_in ?? 900),
                        scope: tokenData.scope ?? "kimi-code",
                        token_type: tokenData.token_type ?? "Bearer",
                    }, null, 2);
                    if (connection) await writeRemoteCredential(connection, opts.account, payload);
                    else writeLocalCredential(ctx, opts.account, payload);
                    flow.status = "connected";
                    break;
                }
            } catch (error: any) {
                flow.status = "failed";
                flow.error = error?.message ?? String(error);
                break;
            }
            const err = tokenData?.error;
            if (err === "authorization_pending") continue;
            if (err === "slow_down") { flow.interval = (flow.interval ?? 5) + 5; continue; }
            if (err === "expired_token") { flow.status = "failed"; flow.error = "device code expired"; break; }
            flow.status = "failed";
            flow.error = tokenData?.error_description ?? err ?? "token endpoint failed";
            break;
        }
        if (opts.instance) await ctx.fns.sshAccount.registry({ action: flow.status === "connected" ? "connect" : "fail", instance: opts.instance, provider: "kimi-coding", account: opts.account }).catch(() => undefined);
        ctx.fns.procs.events.refresh({ topic: "ssh-accounts", reason: "kimi login finished" });
    })().catch(() => undefined);

    return { id };
}

// Remote write: mkdir the isolated slot (refusing symlinked path components),
// then read the JSON from stdin and write it 0600 atomically. The credential
// bytes travel only over the SSH stdin pipe.
async function writeRemoteCredential(connection: { bin: string; args: string[]; host: string }, account: string, payload: string): Promise<void> {
    const root = `.hyper/ssh-accounts/kimi-coding/${account}`;
    const script = [
        "set -eu", "umask 077",
        `root="$HOME/${root}"`,
        `for p in "$HOME/.hyper" "$HOME/.hyper/ssh-accounts" "$HOME/.hyper/ssh-accounts/kimi-coding" "$root"; do test ! -L "$p" || exit 1; done`,
        'mkdir -p "$root" && chmod 700 "$root"',
        'test ! -L "$root/kimi-code.json" || exit 1',
        'tmp="$root/.kimi-code.json.tmp"',
        'cat > "$tmp"',
        'chmod 600 "$tmp"',
        'mv -f "$tmp" "$root/kimi-code.json"',
    ].join("\n");
    const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
    const proc = Bun.spawn([connection.bin, ...connection.args, connection.host, "sh -c " + quote(script)], { stdin: "pipe", stdout: "ignore", stderr: "pipe" });
    (proc.stdin as import("bun").FileSink).write(payload);
    (proc.stdin as import("bun").FileSink).end();
    const code = await proc.exited;
    if (code !== 0) {
        const stderr = await new Response(proc.stderr).text().catch(() => "");
        throw new Error(`remote credential write failed (exit ${code})${stderr ? `: ${stderr.slice(0, 200)}` : ""}`);
    }
}

// Local write: the same isolated slot llm.accountCredentialPath resolves for a
// named Kimi account, created 0700 and written 0600 through a temp file so a
// crash never leaves a half-written credential behind.
function writeLocalCredential(ctx: Context, account: string, payload: string): void {
    const { dir, file } = ctx.fns.llm.accountCredentialPath({ provider: "kimi-coding", account });
    if (!dir || !file) throw new Error("Kimi account requires an isolated credential directory");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error("Refusing to write through a symlink");
    const tmp = join(dir, ".kimi-code.json.tmp");
    writeFileSync(tmp, payload, { mode: 0o600 });
    renameSync(tmp, file);
}
