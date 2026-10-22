/**
 * Fetch measured Kimi Coding Plan quota windows and the account's plan name.
 *
 * Use for subscription quota refresh of a Kimi Coding account, local or held on a trusted SSH instance. Calls only the account's /coding/v1/usages endpoint (and /coding/v1/me for the plan name) with a bounded deadline and no redirects. Rejects failed or unrecognized quota responses instead of inferring unused quota; returns normalized windows for llm.recordUsage. Each window is reported as a used ratio between 0 and 1, which is scaled to used percent. The plan name comes from user_level_name (e.g. "Pro"); when /me fails the plan falls back to "Kimi Coding".
 * @param opts.account Kimi Coding account slot; omit for the default local credential. @default "default"
 * @param opts.timeoutMs Request deadline in milliseconds. @default 5000 @minimum 500 @maximum 30000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Kimi Coding account slot; omit for the default local credential. @default "default" */
        account?: string;
        /** Request deadline in milliseconds. @default 5000 @minimum 500 @maximum 30000 */
        timeoutMs?: number;
    },
): Promise<{ primary?: { used_percent: number; window_minutes: number; resets_at: number }; secondary?: { used_percent: number; window_minutes: number; resets_at: number }; tertiary?: { used_percent: number; window_minutes: number; resets_at: number }; planType: string | null }> {
    const account = String(opts.account ?? "default").trim() || "default";
    const timeout = Math.min(30000, Math.max(500, opts.timeoutMs ?? 5000));
    const base = "https://api.kimi.com/coding/v1/";
    const url = base + "usages";
    const init = { method: "GET", headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeout) };

    // A remote account keeps its credential on the host, so the request must
    // ride the SSH bridge; a local one is read here. State the method
    // explicitly — the bridge defaults to POST and these endpoints are GET-only.
    const remote = /^ssh\.(.+)\.([^.]+)$/.exec(account)?.slice(1);
    let res: Response, meRes: Response | null = null;
    if (account === "default") {
        const token = await localToken(ctx);
        const auth = { ...init.headers, authorization: "Bearer " + token };
        [res, meRes] = await Promise.all([
            ctx.fns.llm.connectFetch({ url, init: { ...init, headers: auth, redirect: "error" } }),
            ctx.fns.llm.connectFetch({ url: base + "me", init: { ...init, headers: auth, redirect: "error" } }).catch(() => null),
        ]);
    } else {
        if (!remote) throw new Error("Not a Kimi Coding account: " + account);
        const instance = remote[0]!, remoteAccount = remote[1]!;
        [res, meRes] = await Promise.all([
            ctx.fns.sshAccount.fetch({ ssh: { instance, provider: "kimi-coding", account: remoteAccount }, url, init }),
            // A plan-name failure must never lose the quota snapshot.
            ctx.fns.sshAccount.fetch({ ssh: { instance, provider: "kimi-coding", account: remoteAccount }, url: base + "me", init }).catch(() => null),
        ]);
    }
    if (!res.ok) throw new Error("Kimi quota HTTP " + res.status);
    // The subscription plan ("Pro", "Max", …) lives on the profile endpoint,
    // not on the quota response; keep the historical name when it is unknown.
    let plan: string | null = null;
    if (meRes?.ok) {
        const me = await meRes.json().catch(() => null) as { user_level_name?: string } | null;
        const level = String(me?.user_level_name ?? "").trim();
        if (level) plan = level;
    }
    const body = await res.json() as { usages?: Record<string, { used_ratio?: number; reset_time?: string } | undefined> };
    const usages = body.usages;
    if (!usages || typeof usages !== "object") throw new Error("Unrecognized Kimi quota response: no usages");

    const result: { primary?: { used_percent: number; window_minutes: number; resets_at: number }; secondary?: { used_percent: number; window_minutes: number; resets_at: number }; tertiary?: { used_percent: number; window_minutes: number; resets_at: number }; planType: string | null } = { planType: plan ?? "Kimi Coding" };
    // used_ratio is a fraction, not a percentage: 0.1 means ten percent used.
    const window = (raw: { used_ratio?: number; reset_time?: string } | undefined, windowMinutes: number) => {
        const ratio = Number(raw?.used_ratio);
        const resets = Date.parse(String(raw?.reset_time ?? ""));
        if (!Number.isFinite(ratio) || ratio < 0 || !Number.isFinite(resets) || resets <= 0) return null;
        return { used_percent: Math.min(100, Math.max(0, ratio * 100)), window_minutes: windowMinutes, resets_at: resets / 1000 };
    };
    const primary = window(usages.limit_5h, 300);
    const secondary = window(usages.limit_7d, 10080);
    // The monthly cap is what actually runs out first on a paid plan, so it
    // must be visible rather than hidden behind the rolling windows.
    const tertiary = window(usages.limit_month_total, 43200);
    if (primary) result.primary = primary;
    if (secondary) result.secondary = secondary;
    if (tertiary) result.tertiary = tertiary;
    if (!primary && !secondary && !tertiary) throw new Error("No recognized Kimi quota windows");
    return result;
}

/** Read the access token of the default local Kimi Coding credential. */
async function localToken(ctx: Context): Promise<string> {
    const configured = await ctx.fns.secrets.resolveSetting({ module: "llm", scopeType: "global", key: "kimiCodingApiKey" });
    if (configured) return configured;
    const { readFileSync } = await import("node:fs");
    const { file } = ctx.fns.llm.accountCredentialPath({ provider: "kimi-coding", account: "default" });
    if (!file) throw new Error("Kimi Coding key is not configured");
    const token = String(JSON.parse(readFileSync(file, "utf8")).access_token ?? "");
    if (!token) throw new Error("Kimi Coding credential has no access token");
    return token;
}