/**
 * Complete a pending local Claude OAuth flow without changing its selected proxy.
 * Validates PKCE state and saves encrypted credentials with the immutable route atomically.
 * @param opts.input Authorization response text or URL.
 * @param opts.code One-time authorization code returned by Claude.
 * @param opts.state OAuth state value.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Authorization response, callback URL, or code to parse. */ input?: string;
        /** One-time authorization code returned by Claude. */ code?: string;
        /** OAuth state value used to validate the callback. */ state?: string },
): Promise<{ ok: true }> {
    const store: any = (ctx.state as any).llm?.anthropicOAuth;
    const parsed = opts.input != null ? ctx.fns.llm.parseAnthropicAuthorizationInput({ input: opts.input }) : { code: opts.code ?? null, state: opts.state ?? null };
    let pending: any = null;
    const active = [...(store?.pending?.values?.() ?? [])].filter((p: any) => p.status === "pending" && p.expiresAt > Date.now());
    if (parsed.state) {
        pending = store?.pending?.get(parsed.state);
        if (!pending && active.length) throw new Error("Anthropic OAuth state mismatch");
    } else if (active.length === 1) pending = active[0];
    if (!pending || pending.expiresAt <= Date.now()) throw new Error("Anthropic OAuth login expired");
    if (parsed.state && parsed.state !== pending.state) throw new Error("Anthropic OAuth state mismatch");
    if (!parsed.code) throw new Error("Anthropic OAuth authorization code is missing");
    if (pending.status !== "pending") throw new Error("Anthropic OAuth callback was already used");
    await ctx.fns.llm.loginProxy({account:pending.account,proxyId:pending.proxyId});
    pending.status = "exchanging";
    try {
        const token = await ctx.fns.llm.exchangeAnthropicOAuth({
            grant: "authorization_code", account:pending.account, proxyId:pending.proxyId, code: parsed.code, state: pending.state,
            verifier: pending.verifier, redirectUri: pending.redirectUri,
        });
        if(pending.status!=="exchanging" || store.pending.get(pending.state)!==pending)throw new Error("Anthropic OAuth login was cancelled");
        if (!token.refresh) throw new Error("Anthropic OAuth token exchange returned an invalid response");
        // The slot was chosen when the flow started; saving into it is what
        // makes a second Claude login an addition rather than a replacement.
        await ctx.fns.llm.saveAnthropicOAuth({ ...token, refresh: token.refresh, account: pending.account ?? "default", proxyId:pending.proxyId, label: pending.label ?? null });
        pending.status = "complete";
        pending.verifier = null;
        store.lastError = null;
        store.pending.delete(pending.state);
        try { pending.server?.close(); } catch {}
        return { ok: true };
    } catch (e: any) {
        pending.status = "failed";
        pending.verifier = null;
        store.lastError = safeError(e);
        pending.error = store.lastError;
        try { pending.server?.close(); } catch {}
        throw Object.assign(new Error(store.lastError),{code:e?.code,noFallback:e?.noFallback,retryable:false});
    }
}

function safeError(e: any): string {
    const s = String(e?.message ?? e);
    return /^(Anthropic OAuth |PROXY_|OAUTH_)/.test(s) ? s.slice(0,500) : "Anthropic OAuth login failed";
}
