// Return models grouped by provider-prefix.
// LM Studio is queried live; remote providers return a small curated static list.
// Missing/unreachable providers are omitted silently.
/**
 * List available models per provider, including a configured One API gateway and hyper/<node> groups.
 * @param opts.skipNodes Omit hyper/<node> groups and do not refresh node catalogues (host-side catalogue building). @default false
 */
export default async function (ctx: Context, _session: Session | null, opts?: { /** Omit node groups. @default false */ skipNodes?: boolean }): Promise<Record<string, string[]>> {
    // The catalogue asks LM Studio, Groq, every Hyper node and each provider's credentials — seconds of
    // work that the model popup and the new-chat form used to wait for on every open. The last answer is
    // returned at once and refreshed in the background once it is a minute old; only the very first call
    // (or a test with a fresh ctx) waits.
    const key = opts?.skipNodes ? "skipNodes" : "all";
    if (!(ctx as any).state) return build(ctx, opts);
    const cache: Record<string, { at: number; value?: Record<string, string[]>; pending?: Promise<Record<string, string[]>> }> =
        ((ctx.state as any).llmModelCatalog ??= {});
    const entry = (cache[key] ??= { at: 0 });
    const refresh = () => entry.pending ??= build(ctx, opts)
        .then(value => { entry.value = value; entry.at = Date.now(); return value; })
        .finally(() => { entry.pending = undefined; });
    if (!entry.value) return refresh();
    if (Date.now() - entry.at > 60_000) refresh().catch(() => undefined);
    // CLI logout happens outside Hyper. Never serve a removed local credential
    // from the stale-while-revalidate cache; remote node routes are independent.
    if (entry.value.codex) {
        const connected = entry.value.codex.filter(model => {
            const prefix = model.split(":", 1)[0] ?? "codex";
            const account = prefix === "codex" ? "default" : prefix.slice("codex/".length);
            return ctx.fns.llm.accountCredentialExists({ provider: "codex", account });
        });
        if (connected.length !== entry.value.codex.length) {
            entry.value = { ...entry.value };
            if (connected.length) entry.value.codex = connected;
            else delete entry.value.codex;
        }
    }
    return entry.value;
}

async function build(ctx: Context, opts?: { skipNodes?: boolean }): Promise<Record<string, string[]>> {
    const out: Record<string, string[]> = {};
    const codexUnavailable: string[] = [];

    // Local: LM Studio /v1/models
    const lmUrl = (ctx.env.LMSTUDIO_URL ?? "http://localhost:1234") + "/v1/models";
    try {
        const res = await fetch(lmUrl, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
            const body: any = await res.json();
            const ids = (body.data ?? []).map((m: any) => m.id).filter(Boolean);
            if (ids.length) out.lmstudio = ids;
        }
    } catch { /* unreachable — skip */ }

    // Saved selections remain visible while the gateway is offline.
    const savedOneapi = await ctx.fns.settings.get({ module: 'llm', scopeType: 'global', key: 'oneapiModels' });
    if (Array.isArray(savedOneapi)) {
        const ids = savedOneapi.filter((id): id is string => typeof id === 'string' && id.length > 0);
        if (ids.length) out.oneapi = ids.map(id => `oneapi:${id}`);
    }
    // Shared bounded, redirect-free probe; offline selections stay visible.
    const gateway = await ctx.fns.llm.gatewayHealth({});
    if (gateway.models.length) out.oneapi = [...new Set([...(out.oneapi ?? []), ...gateway.models.map(id => `oneapi:${id}`)])].sort();

    // Query only the Coding Plan catalogue; standard API billing is never used.
    if (ctx.fns.llm.zaiCodingModels) {
        const ids = await ctx.fns.llm.zaiCodingModels({});
        if (ids.length) out["zai-coding"] = ids.map(id => `zai-coding:${id}`);
    }

    // Query only the M Plan catalogue; standard API billing is never used.
    if (ctx.fns.llm.minimaxCodingModels) {
        const ids = await ctx.fns.llm.minimaxCodingModels({});
        if (ids.length) out["minimax-coding"] = ids.map(id => `minimax-coding:${id}`);
    }

    if (ctx.fns.llm.opencodeModels) {
        const ids = await ctx.fns.llm.opencodeModels({});
        if (ids.length) out.opencode = ids.map(id => `opencode:${id}`);
    }

    // Remote curated defaults are exposed only when their endpoint has usable
    // credentials. Static catalogues describe capabilities, not availability.
    const configured = async (model: string) => {
        try { const endpoint = await ctx.fns.llm.resolveEndpoint({ model }); return endpoint.kind === "local" || !!endpoint.apiKey; }
        catch (error) {
            if ((error as { code?: string })?.code !== "MODEL_DISABLED_BY_USER") return false;
            // Catalogue visibility is credential-based, not inference permission. Never
            // bypass resolveEndpoint's guard or expose an unguarded inference endpoint.
            const provider = model.slice(0, model.indexOf(":"));
            if (provider === "kimi-coding") return !!ctx.env?.KIMI_CODING_API_KEY || !!ctx.fns.llm.accountCredentialExists?.({ provider: "kimi-coding" });
            const keys: Record<string, string> = { kimi: "kimiApiKey", openai: "openaiApiKey", openrouter: "openrouterApiKey" };
            const key = keys[provider];
            return key ? !!await ctx.fns.secrets.resolveSetting({ module: "llm", scopeType: "global", key }) : false;
        }
    };
    if (await configured("kimi:kimi-k3")) out.kimi = [
        "kimi:kimi-k3",
        "kimi:kimi-k2.5",
        "kimi:kimi-k2-thinking-turbo",
        "kimi:kimi-k2-thinking",
    ];
    // Kimi CLI subscription models. These use the Anthropic-compatible coding
    // endpoint and OAuth token managed by `kimi-cli` under ~/.kimi.
    if (await configured("kimi-coding:k3")) out["kimi-coding"] = [
        "kimi-coding:k3",
        "kimi-coding:k3-256k",
        "kimi-coding:kimi-for-coding",
        "kimi-coding:kimi-for-coding-highspeed",
    ];
    if (await configured("openai:gpt-5-codex")) out.openai = [
        "openai:gpt-5-codex",
        "openai:gpt-5.1-mini",
        "openai:gpt-4o-mini",
    ];
    // Groq: query the account catalogue live when a key is configured. Fall back
    // to a small production list so model selection still works before login.
    try {
        const endpoint = await ctx.fns.llm.resolveEndpoint({ model: "groq:openai/gpt-oss-120b" }).catch(async error => {
            if ((error as { code?: string })?.code !== "MODEL_DISABLED_BY_USER") throw error;
            // A catalogue GET is not inference: read only its own credential.
            return { apiKey: await ctx.fns.secrets.resolveSetting({ module: "llm", scopeType: "global", key: "groqApiKey" }) };
        });
        if (endpoint.apiKey) {
            const res = await fetch("https://api.groq.com/openai/v1/models", {
                headers: { authorization: `Bearer ${endpoint.apiKey}` },
                signal: AbortSignal.timeout(3000),
            });
            if (res.ok) {
                const body: any = await res.json();
                const ids = (body.data ?? [])
                    .filter((m: any) => m.active !== false)
                    .map((m: any) => m.id)
                    .filter(Boolean)
                    .map((id: string) => `groq:${id}`)
                    .sort();
                if (ids.length) out.groq = ids;
            }
        }
    } catch { /* missing/invalid key or unreachable — omit */ }
    if (await configured("openrouter:anthropic/claude-sonnet-4.6")) out.openrouter = [
        "openrouter:anthropic/claude-sonnet-4.6",
        "openrouter:google/gemini-2.5-pro",
    ];

    // xAI subscription catalogue. Device OAuth currently exposes the current
    // Grok Responses models; actual availability remains account/plan-specific.
    try {
        const status = await ctx.fns.llm.xaiOAuthStatus?.({});
        if (status?.connected) out.xai = [
            "xai:grok-4.6",
            "xai:grok-4.5",
            "xai:grok-4.3",
        ];
    } catch { /* OAuth migration unavailable / not connected — omit */ }



    // Query each local credential slot independently: a named-only login has no
    // default auth.json, and must remain discoverable after selecting a Hyper node.
    // Keep the legacy default probe for hosts without account discovery support.
    const codexAccounts = ctx.fns.llm.listAccounts
        ? await ctx.fns.llm.listAccounts({ provider: "codex" }).catch(() => [])
        : [{ account: "default", source: "file" }];
    for (const account of codexAccounts) {
        if (account.source === "node" || account.source === "ssh") continue;
        try {
            const tok = await ctx.fns.llm.refreshCodex?.({ account: account.account });
            if (tok) {
                const prefix = account.account === "default" ? "codex" : `codex/${account.account}`;
                const version = await ctx.fns.llm.codexCliVersion({});
                const url = `https://chatgpt.com/backend-api/codex/models?client_version=${encodeURIComponent(version)}`;
                const r = await fetch(url, {
                    headers: { "authorization": `Bearer ${tok}`, "originator": "codex_cli_rs" },
                    signal: AbortSignal.timeout(3000),
                });
                if (r.ok) {
                    const j: any = await r.json();
                    const ids = (j.models ?? [])
                        .filter((m: any) => m.visibility !== "hidden" && m.visibility !== "hide" && m.supported_in_api !== false)
                        .map((m: any) => `${prefix}:${m.slug}`);
                    if (ids.length) (out.codex ??= []).push(...ids);
                } else if (r.status >= 500 || r.status === 429 || r.status === 408) {
                    codexUnavailable.push(account.account);
                    console.warn(`[model-catalog] provider=codex account=${account.account} status=${r.status} transient=true`);
                } else {
                    console.warn(`[model-catalog] provider=codex account=${account.account} status=${r.status} transient=false`);
                }
            }
        } catch (error) {
            // Never log provider bodies, credentials, or exception messages (which
            // can contain request headers). Missing discovery is not a denial.
            const name = error instanceof Error ? error.name : "Error";
            const transient = ["TypeError", "TimeoutError", "AbortError"].includes(name);
            if (transient) codexUnavailable.push(account.account);
            console.warn(`[model-catalog] provider=codex account=${account.account} error=${name} transient=${transient}`);
        }
    }

    // Claude subscription models. We cannot query an account-specific model
    // catalogue from the Messages API, so expose the current Anthropic aliases
    // for every connected subscription source. Availability still depends on
    // the user's plan and Anthropic policy; an unsupported choice fails clearly.
    const claudeModels = [
        "claude-haiku-4-5",
        "claude-sonnet-4-5",
        "claude-sonnet-4-6",
        "claude-sonnet-5",
        "claude-opus-4-5",
        "claude-opus-4-6",
        "claude-opus-4-8",
        // Current Claude Platform aliases verified against Anthropic's live
        // Models overview. Availability remains account/plan-specific.
        "claude-opus-5",
        "claude-opus-5-5",
        "claude-fable-5",
        "claude-fable-5-1",
    ];
    // Remote credentials and provider network calls remain on the selected SSH host.
    if (ctx.fns.sshAccount?.registry) {
        const [remoteAccounts, instances] = await Promise.all([ctx.fns.sshAccount.registry({action:'list'}).catch(()=>[]),ctx.fns.sshInstance.list({}).catch(()=>[])]);
        const remoteCache:Record<string,string[]> = (ctx as any).state ? ((ctx as any).state.sshModelCatalog??={}) : {};
        await Promise.all(remoteAccounts.filter(x=>(x.provider==='codex'||x.provider==='claude-code'||x.provider==='kimi-coding')&&x.status==='connected'&&instances.some(i=>i.name===x.instance&&i.pinnedHostKey)).map(async remote=>{
            const prefix=`ssh/${remote.instance}:${remote.provider}/${remote.account}`;
            const key=`ssh/${remote.instance}`;
            if(remote.provider==='claude-code') { (out[key]??=[]).push(...claudeModels.map(id=>`${prefix}:${id}`)); return; }
            // Kimi publishes an account-specific catalogue on the coding host, so
            // ask the host rather than guessing a static list the plan may not have.
            if(remote.provider==='kimi-coding') {
                let models=remoteCache[prefix]??[];
                try {
                    const response=await ctx.fns.sshAccount.fetch({ssh:{instance:remote.instance,provider:remote.provider,account:remote.account},url:'https://api.kimi.com/coding/v1/models',init:{method:'GET',headers:{accept:'application/json'},signal:AbortSignal.timeout(10000)}});
                    if(response.ok){const data=await response.json() as {data?:Array<{id?:string}>};models=(data.data??[]).map(x=>x.id).filter((id): id is string => Boolean(id)).map(id=>`${prefix}:${id}`);remoteCache[prefix]=models;}
                    else if(response.status!==408&&response.status!==429&&response.status<500){models=[];delete remoteCache[prefix];}
                } catch { /* Keep the last successful catalogue through transient SSH outages. */ }
                if(models.length)(out[key]??=[]).push(...models);
                return;
            }
            let models=remoteCache[prefix]??[];
            try {
                const response=await ctx.fns.sshAccount.fetch({ssh:{instance:remote.instance,provider:remote.provider,account:remote.account},url:'https://chatgpt.com/backend-api/codex/models?client_version='+encodeURIComponent(await ctx.fns.llm.codexCliVersion({})),init:{method:'GET',signal:AbortSignal.timeout(10000)}});
                if(response.ok){const data=await response.json() as {models?:Array<{slug:string;visibility?:string;supported_in_api?:boolean}>};models=(data.models??[]).filter(x=>x.visibility!=='hidden'&&x.visibility!=='hide'&&x.supported_in_api!==false).map(x=>`${prefix}:${x.slug}`);remoteCache[prefix]=models;}
                else if(response.status!==408&&response.status!==429&&response.status<500){models=[];delete remoteCache[prefix];}
            } catch { /* Keep the last successful catalogue through transient SSH outages. */ }
            if(models.length)(out[key]??=[]).push(...models);
        }));
    }
    try {
        const tok = await ctx.fns.llm.refreshClaudeCode?.({});
        if (tok) out["claude-code"] = claudeModels.map(id => `claude-code:${id}`);
    } catch { /* no keychain access — omit */ }

    try {
        const managed = await ctx.fns.llm.anthropicOAuthStatus?.({});
        if (managed?.connected) {
            const accounts = managed.accounts ?? [];
            out["anthropic-oauth"] = accounts.flatMap((entry: any) => {
                const account = String(entry.account ?? "default");
                const prefix = account === "default" ? "anthropic-oauth" : `anthropic-oauth/${account}`;
                return claudeModels.map(id => `${prefix}:${id}`);
            });
        }
    } catch { /* migration unavailable / not connected — omit */ }

    // Other Hypers we relay through (docs/hyper-node.md): one group per node,
    // from the cached catalogue (refreshed at most every 5 minutes).
    if (!opts?.skipNodes) try {
        for (const node of await ctx.fns.node.list({})) {
            if (!node.enabled) continue;
            const fresh = await ctx.fns.node.refresh({ name: node.name, maxAgeMs: 5 * 60_000 }).catch(() => null);
            // Transport outages do not revoke previously advertised choices. Explicit
            // HTTP denials are not an offline fallback; successful empty snapshots
            // also remain authoritative (never merge with the previous catalogue).
            if (!fresh || !fresh.enabled || !fresh.catalogAt || /^models 4(?!08:|29:)\d\d:/.test(fresh.lastError ?? "")) continue;
            const catalog = fresh.catalog ?? [];
            if (catalog.length) out[`hyper/${node.name}`] = catalog.map((e) => `hyper/${node.name}:${e.id}`);
        }
    } catch { /* node tables absent (fresh db) — omit */ }
    if (ctx.state) {
        const failures = ((ctx.state as any).llmModelCatalogFailures ??= {});
        failures[opts?.skipNodes ? "skipNodes" : "all"] = { at: Date.now(), codex: codexUnavailable };
    }
    return out;
}
