/**
 * Return a credential-free quota inventory with named windows and backend severity
 *
 * Use for the JSON quota API and legacy usage renderers. Orders providers and connection identities independently of usage. Retains last-good quota windows in per-account durable kv records for strictly less than 30 minutes from the source snapshot timestamp, never from reread time. Failed sources are logged; successful local inventory reads remove disconnected accounts. Remote absence preserves identity with unavailable windows after expiry. Providers without usage expose availability only.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<{ updatedAt: number; accounts: types.llms.QuotaAccount[]; entries: types.llms.UsageEntry[]; gateway: { status: string; reason?: string; models: string[] } | null }> {
    const now = Date.now();
    // This API owns a separate durable last-good cache: refresh failures must not
    // overwrite successful snapshots or move their observation timestamps forward.
    const prefix = "llms:quota:last-good:v1:";
    const rows = await ctx.fns.procs.db.select({sql:"SELECT key, value FROM kv WHERE key LIKE ?",params:[prefix+"%"]}) as Array<{key:string;value:string}>;
    const cached = new Map<string, types.llms.UsageEntry>();
    for (const row of rows) {
        try { cached.set(row.key, JSON.parse(row.value)); }
        catch (error) { console.warn("Invalid quota retention record", row.key, error); }
    }
    const key = (e: types.llms.UsageEntry) => prefix+JSON.stringify([e.provider,e.node ?? null,e.account]);
    let entries: types.llms.UsageEntry[] = [];
    let gateway: {status:string;reason?:string;models:string[]} | null = null;
    try { ({entries,gateway} = await ctx.fns.llms.usageData({includeConnected:true})); }
    catch (error) { console.warn("Quota source unavailable; using bounded last-good snapshots", error); }
    // Only a successful inventory read can prove a local credential disconnected.
    // Absence from a remote snapshot is not evidence of disconnection.
    let connected: Set<string> | null = null;
    try { connected = new Set((await ctx.fns.llm.listAccounts({})).map(a => JSON.stringify([a.provider,a.account]))); }
    catch (error) { console.warn("Quota account inventory unavailable; preserving identities", error); }
    const inventoryProviders = new Set(["codex","kimi-coding","claude-code","anthropic-oauth","xai","zai-coding","minimax-coding","opencode"]);
    const disconnected = (e: types.llms.UsageEntry) => connected != null && !e.node && !e.account.startsWith("ssh.") && inventoryProviders.has(e.provider) && !connected.has(JSON.stringify([e.provider,e.account]));
    entries = entries.filter(e => !disconnected(e));
    const seen = new Set(entries.map(key));
    for (const [k,e] of cached) {
        if (disconnected(e)) {
            await ctx.fns.procs.db.run({sql:"DELETE FROM kv WHERE key = ?",params:[k]});
            cached.delete(k);
        } else if (!seen.has(k)) entries.push({...e,windows:{},usedPercent:null,quotaStatus:"unavailable"});
    }
    const validWindows = (e: types.llms.UsageEntry) => Object.values(e.windows ?? {}).some(w => w && Number.isFinite(w.usedPercent) && w.usedPercent >= 0 && w.usedPercent <= 100 && (w.windowMinutes === 300 || w.windowMinutes === 10080 || w.windowMinutes != null && w.windowMinutes >= 40320 && w.windowMinutes <= 44640));
    const observedAt = new Map<string, number>();
    entries = await Promise.all(entries.map(async current => {
        const e = {...current};
        const k = key(e);
        const previous = cached.get(k);
        const successful = validWindows(e) && e.updatedAt > 0 && e.updatedAt <= now && e.quotaStatus !== "unavailable";
        if (successful && (!previous || e.updatedAt > previous.updatedAt)) {
            await ctx.fns.procs.db.run({sql:"INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value WHERE (kv.value::jsonb->>'updatedAt')::bigint < (EXCLUDED.value::jsonb->>'updatedAt')::bigint",params:[k,JSON.stringify(e)]});
        }
        const snapshot = successful && (!previous || e.updatedAt >= previous.updatedAt) ? e : previous;
        if (snapshot) observedAt.set(k,snapshot.updatedAt);
        if (snapshot && now-snapshot.updatedAt < 30*60_000) {
            if (snapshot !== e) Object.assign(e,{windows:snapshot.windows,usedPercent:snapshot.usedPercent,resetsAt:snapshot.resetsAt,updatedAt:snapshot.updatedAt,quotaStatus:"stale"});
        } else if (snapshot || e.updatedAt > 0 && now-e.updatedAt >= 30*60_000) {
            Object.assign(e,{windows:{},usedPercent:null,resetsAt:null,updatedAt:snapshot?.updatedAt ?? e.updatedAt,quotaStatus:"unavailable"});
        }
        return e;
    }));
    const warnAt = Number(await ctx.fns.settings.getNumber({module:"llm",scopeType:"global",key:"usageWarnPercent",fallback:30}));
    const criticalAt = Number(await ctx.fns.settings.getNumber({module:"llm",scopeType:"global",key:"usageCriticalPercent",fallback:60}));
    const alertAt = Number(await ctx.fns.settings.getNumber({module:"llm",scopeType:"global",key:"usageAlertPercent",fallback:75}));
    const tone = (v: number | null): types.llms.QuotaAccount["tone"] => v == null ? "neutral" : v >= alertAt ? "error" : v >= criticalAt ? "critical" : v >= warnAt ? "warning" : "neutral";
    const providers = new Set(["codex","claude-code","anthropic-oauth","kimi-coding","kimi","zai-coding","zai","minimax-coding"]);
    const accounts: types.llms.QuotaAccount[] = entries.map(entry => {
     const ssh = /^ssh\.(.+)\.([^.]+)$/.exec(entry.account);
     const host = entry.node ?? ssh?.[1];
     const account = ssh?.[2] ?? entry.account;
     const connection = entry.node ? "hyper" : ssh ? "ssh" : "local";
     const kind = providers.has(entry.provider) || entry.provider === "opencode" && /go/i.test(entry.planType ?? "") ? "quota" : "status";
     const windows: NonNullable<types.llms.QuotaAccount["windows"]> = {};
     let expired = false;
     for (const w of Object.values(entry.windows ?? {})) {
      if (!w) continue;
      const m = w.windowMinutes;
      const period = m === 300 ? "fiveHour" : m === 10080 ? "weekly" : m != null && m >= 40320 && m <= 44640 ? "monthly" : null;
      if (!period) continue;
      const resetsAt = typeof w.resetsAt === "number" && Number.isFinite(w.resetsAt) && w.resetsAt > 0 ? w.resetsAt : null;
      const stale = resetsAt != null && resetsAt <= now;
      expired ||= stale;
      const v = !stale && Number.isFinite(w.usedPercent) && w.usedPercent >= 0 && w.usedPercent <= 100 ? w.usedPercent : null;
      if (!windows[period] || (v ?? -1) > (windows[period]?.usedPercent ?? -1)) windows[period] = {usedPercent:v,resetsAt,tone:tone(v)};
     }
     const values = Object.values(windows).map(w => w.usedPercent).filter((v): v is number => v != null);
     const fallback = entry.usedPercent != null && Number.isFinite(entry.usedPercent) && entry.usedPercent >= 0 && entry.usedPercent <= 100 && (!entry.resetsAt || entry.resetsAt > now) ? entry.usedPercent : null;
     const worst = values.length ? Math.max(...values) : fallback;
     entry.thresholds = {warnAt,criticalAt,alertAt};
     entry.tone = kind === "quota" ? tone(worst) : "neutral";
     return {id:entry.provider+":"+account+(host ? "@"+host : ""),provider:entry.provider,account,label:entry.label,model:entry.provider+"/"+account+":",connection,...(host ? {host} : {}),kind,
     ...(kind === "quota" ? {windows,quotaUpdatedAt:observedAt.get(key(entry)) ?? null,quotaStatus:worst == null ? "unavailable" as const : expired || entry.quotaStatus === "stale" || !entry.updatedAt || now-entry.updatedAt > 300000 ? "stale" as const : "fresh" as const} : {status:entry.needsReconnect || entry.available === false ? "unavailable" as const : entry.available === true ? "available" as const : "unknown" as const}),tone:entry.tone,planType:entry.planType,needsReconnect:entry.needsReconnect,parkedAgents:entry.parkedAgents};
    });
    if (gateway) accounts.push({id:"oneapi:default",provider:"oneapi",account:"default",label:"Asoft LLM Gate",model:"oneapi/default:",connection:"local",kind:"status",status:gateway.reason === "disabled" ? "disabled" : gateway.status === "ok" || gateway.status === "available" ? "available" : gateway.status === "disabled" ? "disabled" : gateway.status === "error" || gateway.status === "unavailable" ? "unavailable" : "unknown",tone:"neutral",parkedAgents:0});
    const providerOrder = ["codex","claude-code","kimi-coding","zai-coding","minimax-coding","opencode","oneapi"];
    const connectionOrder = ["local","hyper","ssh"];
    const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
    accounts.sort((a,b) => {
        const ai = providerOrder.indexOf(a.provider), bi = providerOrder.indexOf(b.provider);
        return (ai < 0 ? providerOrder.length : ai)-(bi < 0 ? providerOrder.length : bi)
            || compare(a.provider,b.provider) || connectionOrder.indexOf(a.connection)-connectionOrder.indexOf(b.connection)
            || compare(a.host ?? "",b.host ?? "") || compare(a.account,b.account) || compare(a.id,b.id);
    });
    return {updatedAt:now,accounts,entries,gateway};
}
