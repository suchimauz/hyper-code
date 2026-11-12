/**
 * Start, poll or cancel a native Codex device-code login for one connection
 *
 * Device-code OAuth login of the built-in codex model provider, implemented over HTTP without the codex CLI and without commands on SSH instances; every request goes through conn.fetch (direct, SOCKS proxy or SSH tunnel). op `start` requests a user code, starts background polling (403/404 = pending, 15-minute expiry) and the single, never-retried code-for-token exchange, then stores tokens via models.codexAuth; a new start cancels a previous pending flow. op `status` and `cancel` read or stop the current flow. Returns only flowId, status, verification link, the one-time user code, expiry and a safe message — never tokens, device auth ids or verifiers. Flows are process-local and lost on restart.
 * @param opts.conn Resolved codex connection whose fetch carries every login request; resolve it with a long per-request timeout.
 * @param opts.op Operation to perform.
 * @param opts.intervalMs Override of the server poll interval, for tests. @minimum 1 @maximum 60000
 * @param opts.maxWaitMs Override of the 15-minute login expiry, for tests. @default 900000 @minimum 1 @maximum 900000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved codex connection whose fetch carries every login request; resolve it with a long per-request timeout. */
        conn: types.models.ResolvedConnection;
        /** Operation to perform. */
        op: "start" | "status" | "cancel";
        /** Override of the server poll interval, for tests. @minimum 1 @maximum 60000 */
        intervalMs?: number;
        /** Override of the 15-minute login expiry, for tests. @default 900000 @minimum 1 @maximum 900000 */
        maxWaitMs?: number;
    },
): Promise<{ kind: "device-code"; flowId: string; status: types.models.LoginFlow["status"]; verificationUri?: string; userCode?: string; expiresAt: number; message?: string } | null> {
    const conn = opts.conn;
        const issuer = "https://auth.openai.com", clientId = "app_EMoamEEZ73f0CkXaXp7hrann";
        ctx.state.models ??= {};
        const flows = (ctx.state.models.loginFlows ??= {});
        const view = (f: types.models.LoginFlow | undefined) => f ? { kind: "device-code" as const, flowId: f.flowId, status: f.status, verificationUri: f.verificationUri, userCode: f.userCode, expiresAt: f.expiresAt, ...(f.message ? { message: f.message } : {}) } : null;
        const json = { "content-type": "application/json", accept: "application/json" };
        if (opts.op === "status") {
            const f = flows[conn.id];
            if (f && f.status === "pending" && Date.now() >= f.expiresAt) { f.status = "expired"; f.message = "Login code expired"; f.abort.abort(); }
            return view(f);
        }
        if (opts.op === "cancel") {
            const f = flows[conn.id];
            if (f && f.status === "pending") { f.status = "failed"; f.message = "Login cancelled"; f.abort.abort(); }
            return view(f);
        }
        // op === "start": cancel any previous pending flow first.
        const prev = flows[conn.id];
        if (prev?.status === "pending") { prev.status = "failed"; prev.message = "Superseded by a new login"; prev.abort.abort(); }
        const res = await conn.fetch(issuer + "/api/accounts/deviceauth/usercode", { method: "POST", headers: json, body: JSON.stringify({ client_id: clientId }) });
        if (res.status === 404) { await res.body?.cancel().catch(() => undefined); throw Object.assign(new Error("Device code login is not enabled for this server"), { code: "LOGIN_UNAVAILABLE", status: 409 }); }
        if (!res.ok) { await res.body?.cancel().catch(() => undefined); throw Object.assign(new Error("Device code request failed with HTTP " + res.status), { code: "LOGIN_FAILED", status: 502 }); }
        const uc = await res.json() as { device_auth_id?: unknown; user_code?: unknown; usercode?: unknown; interval?: unknown };
        const deviceAuthId = typeof uc.device_auth_id === "string" ? uc.device_auth_id : "";
        const userCode = typeof uc.user_code === "string" ? uc.user_code : typeof uc.usercode === "string" ? uc.usercode : "";
        if (!deviceAuthId || !userCode) throw Object.assign(new Error("Device code response is incomplete"), { code: "LOGIN_FAILED", status: 502 });
        const seconds = Number(String(uc.interval ?? "").trim());
        const intervalMs = opts.intervalMs ?? (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 60) * 1000 : 5000);
        const flow: types.models.LoginFlow = { kind: "device-code", flowId: crypto.randomUUID(), status: "pending", verificationUri: issuer + "/codex/device", userCode, expiresAt: Date.now() + (opts.maxWaitMs ?? 15 * 60_000), abort: new AbortController() };
        flows[conn.id] = flow;
        const signal = flow.abort.signal;
        const finish = (status: "succeeded" | "failed" | "expired", message: string) => { if (flow.status === "pending") { flow.status = status; flow.message = message; } };
        const sleep = (ms: number) => new Promise<void>(resolve => { const t = setTimeout(resolve, ms); signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true }); });
        flow.done = (async () => {
            try {
                let code: { authorization_code?: unknown; code_verifier?: unknown } | null = null;
                while (!signal.aborted) {
                    if (Date.now() >= flow.expiresAt) { finish("expired", "Login code expired"); flow.abort.abort(); return; }
                    await sleep(intervalMs);
                    if (signal.aborted || flow.status !== "pending") return;
                    const poll = await conn.fetch(issuer + "/api/accounts/deviceauth/token", { method: "POST", headers: json, body: JSON.stringify({ device_auth_id: deviceAuthId, user_code: userCode }), signal });
                    if (poll.status === 403 || poll.status === 404) { await poll.body?.cancel().catch(() => undefined); continue; }
                    if (!poll.ok) { await poll.body?.cancel().catch(() => undefined); finish("failed", "Authorization check failed with HTTP " + poll.status); return; }
                    code = await poll.json() as { authorization_code?: unknown; code_verifier?: unknown };
                    break;
                }
                if (!code || signal.aborted || flow.status !== "pending") return;
                if (typeof code.authorization_code !== "string" || typeof code.code_verifier !== "string") { finish("failed", "Authorization response is incomplete"); return; }
                // Never retried: an authorization code may be consumed by a request whose reply was lost.
                const ex = await conn.fetch(issuer + "/oauth/token", {
                    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, signal,
                    body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code: code.authorization_code, redirect_uri: issuer + "/deviceauth/callback", code_verifier: code.code_verifier }).toString(),
                });
                if (!ex.ok) { await ex.body?.cancel().catch(() => undefined); finish("failed", "Token exchange failed with HTTP " + ex.status + "; start login again"); return; }
                const tokens = await ex.json() as { id_token?: string; access_token: string; refresh_token?: string };
                if (signal.aborted || flow.status !== "pending") return;
                await ctx.fns.models.codexAuth({ conn, op: "store", tokens });
                finish("succeeded", "Logged in");
            } catch (error) {
                if (flow.status === "pending") finish("failed", signal.aborted ? "Login cancelled" : ctx.fns.models.safeMessage({ message: error, fallback: "Login failed" }));
            }
        })();
        flow.done.catch(() => undefined);
        return view(flow);
}
