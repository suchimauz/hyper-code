// Exchange an authorization code or rotating refresh token. Errors are
// deliberately sanitized: token endpoint bodies can contain secrets.
/**
 * Exchange an Anthropic authorization code or refresh token for OAuth credentials.
 * @param opts.grant OAuth grant type that selects the exchange payload.
 * @param opts.code Authorization code returned by Anthropic.
 * @param opts.state OAuth state returned with the authorization code.
 * @param opts.verifier PKCE verifier created when authorization started.
 * @param opts.redirectUri Redirect URI used for the authorization request.
 * @param opts.refreshToken Refresh token used to rotate credentials.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Local credential slot; pending login uses the target slot. @default "default" */ account?: string;
        /** Validated pending OAuth proxy selection; existing bindings cannot change. */ proxyId?: string | null;
        /** Caller cancellation through token response consumption. */ signal?: AbortSignal;
    } & ({
        /** Authorization-code grant discriminator. */ grant: "authorization_code";
        /** Authorization code returned by Anthropic. */ code: string;
        /** OAuth state returned with the authorization code. */ state: string;
        /** PKCE verifier created when authorization started. */ verifier: string;
        /** Redirect URI used for the authorization request. */ redirectUri: string;
    } | {
        /** Refresh-token grant discriminator. */ grant: "refresh_token";
        /** Refresh token used to rotate credentials. */ refreshToken: string;
    }),
): Promise<{ access: string; refresh: string | null; expiresAt: number; scopes: string | null }> {
    const c = ctx.fns.llm.anthropicOAuthConstants({});
    const body: any = opts.grant === "authorization_code" ? {
        grant_type: "authorization_code", client_id: c.clientId,
        code: opts.code, state: opts.state, redirect_uri: opts.redirectUri, code_verifier: opts.verifier,
    } : {
        grant_type: "refresh_token", client_id: c.clientId, refresh_token: opts.refreshToken,
    };
    let res: Response;
    try {
        res = await ctx.fns.llm.claudeFetch({account:opts.account ?? "default",proxyId:opts.proxyId,url:c.tokenUrl,ms:30000,init: {
            method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(body), signal: opts.signal ? AbortSignal.any([opts.signal,AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
        }});
    } catch (error) {
        const e=error as Error & {code?:string;requestSent?:boolean};
        if (e.requestSent === false) throw error;
        throw Object.assign(new Error("OAUTH_OUTCOME_UNKNOWN: token exchange may have completed; reconnect the account" + (e.code?.startsWith("PROXY_") ? ` (${e.code}: ${e.message.slice(0,250)})` : "")),{code:"OAUTH_OUTCOME_UNKNOWN",retryable:false,noFallback:true,requestSent:true});
    }
    if (!res.ok) { await res.text().catch(() => ""); throw new Error(`Anthropic OAuth token exchange rejected (HTTP ${res.status})`); }
    let data: any;
    try { data = await res.json(); } catch (error) {const e=error as Error & {code?:string};throw Object.assign(new Error("OAUTH_OUTCOME_UNKNOWN: token response was interrupted or invalid; reconnect"+(e.code?.startsWith("PROXY_")?` (${e.code}: ${e.message.slice(0,250)})`:"")),{code:"OAUTH_OUTCOME_UNKNOWN",retryable:false,noFallback:true,requestSent:true});}
    if (typeof data.access_token !== "string" || !data.access_token || typeof data.expires_in !== "number") {
        throw new Error("Anthropic OAuth token exchange returned an invalid response");
    }
    return {
        access: data.access_token,
        refresh: typeof data.refresh_token === "string" && data.refresh_token ? data.refresh_token : null,
        expiresAt: Date.now() + data.expires_in * 1000 - 5 * 60_000,
        scopes: typeof data.scope === "string" ? data.scope : null,
    };
}
