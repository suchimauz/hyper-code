type CodexAuthRecord = { idToken: string; accessToken: string; refreshToken: string; accountId: string; expiresAt: number; needsLogin: boolean };
/**
 * Read, store, refresh or clear a Codex connection's encrypted OAuth tokens
 *
 * Token store of the built-in codex model provider. Keeps one encrypted local secret per connection (namespace models, `<id>.codex-auth`) with compare-and-swap revisions. op `status` returns login state; `token` returns a valid access token, refreshing it through conn.fetch (the connection transport) when it expires within 60 s, with one shared refresh per connection and stale-revision protection; `store` saves tokens from a completed login; `markLogin` flags the connection as requiring login (after a 401 or a rejected refresh); `clear` deletes the tokens without network access (logout). Throws code LOGIN_REQUIRED when no usable login exists. Only `token` returns a credential, and callers must never return or log it.
 * @param opts.conn Resolved codex connection; its fetch is the only network path.
 * @param opts.op Operation to perform.
 * @param opts.tokens OAuth token response to persist; required for op store.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved codex connection; its fetch is the only network path. */
        conn: types.models.ResolvedConnection;
        /** Operation to perform. */
        op: "status" | "token" | "store" | "markLogin" | "clear";
        /** OAuth token response to persist; required for op store. */
        tokens?: { id_token?: string; access_token: string; refresh_token?: string };
    },
): Promise<{ loggedIn: boolean; needsLogin: boolean; accountId: string | null; expiresAt: number | null; accessToken?: string }> {
    const conn = opts.conn;
        const ns = "models", name = conn.id + ".codex-auth";
        const issuer = "https://auth.openai.com", clientId = "app_EMoamEEZ73f0CkXaXp7hrann";
        const fail = (message: string, code: string) => Object.assign(new Error(message), { code, status: 409, retryable: false });
        const claims = (jwt: unknown): Record<string, any> | null => {
            try { const part = typeof jwt === "string" ? jwt.split(".")[1] : undefined; return part ? JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()) : null; } catch { return null; }
        };
        const read = async (): Promise<{ version: number; value: CodexAuthRecord } | null> => {
            const rows = await ctx.fns.procs.db.select({ sql: "SELECT value_enc, version FROM local_secrets WHERE namespace=? AND name=?", params: [ns, name] }) as { value_enc: string; version: number }[];
            if (!rows[0]) return null;
            const value = JSON.parse(await ctx.fns.secrets.decryptLocal({ namespace: ns, name, envelope: rows[0].value_enc })) as CodexAuthRecord;
            return { version: Number(rows[0].version), value };
        };
        const cas = async (version: number, value: CodexAuthRecord): Promise<boolean> => {
            const envelope = await ctx.fns.secrets.encryptLocal({ namespace: ns, name, value: JSON.stringify(value) });
            const rows = await ctx.fns.procs.db.select({ sql: "UPDATE local_secrets SET value_enc=?, version=version+1, source='codex-refresh', updated_at=? WHERE namespace=? AND name=? AND version=? RETURNING version", params: [envelope, Date.now(), ns, name, version] });
            return rows.length > 0;
        };
        const touch = async () => {
            await ctx.fns.procs.db.run({ sql: "UPDATE llm_connections SET updated_at = GREATEST(updated_at + 1, ?) WHERE id=?", params: [Date.now(), conn.id] });
            try { await ctx.fns.procs.events.refresh({ topic: "llm-models", reason: "models-codex-auth" }); } catch (error) { ctx.fns.procs.log.debug({ event: "models.refresh", msg: String(error) }); }
        };
        const record = (t: { id_token?: unknown; access_token?: unknown; refresh_token?: unknown }, previous?: CodexAuthRecord): CodexAuthRecord => {
            if (typeof t.access_token !== "string" || !t.access_token) throw new Error("Token response has no access token");
            const idToken = typeof t.id_token === "string" && t.id_token ? t.id_token : previous?.idToken ?? "";
            const auth = (claims(idToken) ?? {})["https://api.openai.com/auth"] ?? (claims(t.access_token) ?? {})["https://api.openai.com/auth"];
            const exp = Number((claims(t.access_token) ?? {}).exp);
            return {
                idToken, accessToken: t.access_token,
                refreshToken: typeof t.refresh_token === "string" && t.refresh_token ? t.refresh_token : previous?.refreshToken ?? "",
                accountId: typeof auth?.chatgpt_account_id === "string" ? auth.chatgpt_account_id : previous?.accountId ?? "",
                expiresAt: Number.isFinite(exp) && exp > 0 ? exp * 1000 : Date.now() + 3600_000,
                needsLogin: false,
            };
        };
        const summary = (r: CodexAuthRecord | null | undefined) => ({ loggedIn: !!r && !r.needsLogin, needsLogin: !r || r.needsLogin, accountId: r?.accountId || null, expiresAt: r?.expiresAt ?? null });
    
        if (opts.op === "status") return summary((await read())?.value);
        if (opts.op === "clear") {
            await ctx.fns.secrets.deleteLocal({ namespace: ns, name });
            await touch();
            return summary(null);
        }
        if (opts.op === "store") {
            if (!opts.tokens) throw new Error("tokens required");
            const value = record(opts.tokens);
            await ctx.fns.secrets.putLocal({ namespace: ns, name, value: JSON.stringify(value), source: "codex-login" });
            await touch();
            return summary(value);
        }
        if (opts.op === "markLogin") {
            for (let i = 0; i < 3; i++) {
                const cur = await read();
                if (!cur || cur.value.needsLogin) break;
                if (await cas(cur.version, { ...cur.value, needsLogin: true })) { await touch(); break; }
            }
            return summary((await read())?.value);
        }
        // op === "token"
        const fresh = (r: CodexAuthRecord) => r.expiresAt - Date.now() > 60_000;
        const first = await read();
        if (!first || first.value.needsLogin || !first.value.accessToken) throw fail("Codex login required", "LOGIN_REQUIRED");
        if (fresh(first.value)) return { ...summary(first.value), accessToken: first.value.accessToken };
        ctx.state.models ??= {};
        const inflight = (ctx.state.models.codexRefresh ??= {});
        inflight[conn.id] ??= (async () => {
            const cur = await read();
            if (!cur || cur.value.needsLogin) throw fail("Codex login required", "LOGIN_REQUIRED");
            if (fresh(cur.value)) return cur.value.accessToken;
            if (!cur.value.refreshToken) { await ctx.fns.models.codexAuth({ conn, op: "markLogin" }); throw fail("Codex login required", "LOGIN_REQUIRED"); }
            const res = await conn.fetch(issuer + "/oauth/token", {
                method: "POST",
                headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
                body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, refresh_token: cur.value.refreshToken }).toString(),
            });
            if (res.status === 400 || res.status === 401) { await res.body?.cancel().catch(() => undefined); await ctx.fns.models.codexAuth({ conn, op: "markLogin" }); throw fail("Codex login required: token refresh was rejected", "LOGIN_REQUIRED"); }
            if (!res.ok) { await res.body?.cancel().catch(() => undefined); throw Object.assign(new Error("Codex token refresh failed with HTTP " + res.status), { code: "REFRESH_FAILED", status: 502 }); }
            const next = record(await res.json() as Record<string, unknown>, cur.value);
            if (await cas(cur.version, next)) return next.accessToken;
            const raced = await read();
            if (raced && !raced.value.needsLogin && fresh(raced.value)) return raced.value.accessToken;
            throw Object.assign(new Error("Codex credentials changed during refresh"), { code: "REFRESH_FAILED", status: 409 });
        })().finally(() => { delete inflight[conn.id]; });
        const accessToken = await inflight[conn.id]!;
        return { ...summary((await read())?.value), accessToken };
}
