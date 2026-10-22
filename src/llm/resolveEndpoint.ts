// Parse agent.model "provider:modelId" → {url, apiKey, modelId, provider, api}.
// "modelId" without prefix defaults to provider "lmstudio".
//
// An optional account segment selects WHICH credential of that provider to use:
// "codex/personal:gpt-5.6-sol". Omitted means account "default" — the historical
// single-credential behaviour, unchanged. Quota belongs to a subscription
// account, not to a provider, so parking and usage tracking key on both.
/** Resolve a provider-prefixed model to its authenticated wire endpoint, including configurable One API gateways. */
/**
 * Parse agent.model "provider[/account]:modelId" into a callable endpoint.
 * @param opts.model Model identifier.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
        /** Model identifier to use. */ model: string }): Promise<{
    url: string;
    apiKey: string | null;
    modelId: string;
    provider: string;
    account: string;
    kind: "subscription" | "api" | "local";
    api: "openai" | "anthropic" | "responses" | "mock";
    /** For hyper/<node> models: the provider the node uses upstream (e.g. claude-code). */
    upstream?: string;
    /** Node-scoped upstream quota identity; transport account remains the node name. */
    quotaAccount?: string;
    /** Remote SSH execution route; credentials never leave this host. */
    ssh?: { instance: string; provider: "codex" | "claude-code"; account: string };
}> {
    const model = opts.model;
    if (/^(?:ssh\/[^:]+:)?cursor(?:\/|:)/.test(model)) throw Object.assign(new Error("Provider unavailable"), { retryable: false, replaySafe: false });
    if (model.startsWith('ssh/')) {
        const remote = /^ssh\/([A-Za-z0-9][A-Za-z0-9_.-]{0,63}):(codex|claude-code)\/([A-Za-z0-9][A-Za-z0-9_-]{0,39}):([^:\s]+)$/.exec(model);
        if (!remote || [remote[1], remote[3]].some(x => x === '.' || x === '..')) throw new Error('invalid SSH subscription model route');
        const instance = remote[1]!; const provider = remote[2]! as 'codex'|'claude-code'; const account = remote[3]!; const modelId = remote[4]!;
        if (!ctx.fns?.sshInstance?.list || !ctx.fns?.sshAccount?.registry) throw new Error('SSH transport is not ready');
        const [instances, accounts] = await Promise.all([ctx.fns.sshInstance.list({}), ctx.fns.sshAccount.registry({action:'list'})]);
        if (!instances.some(x=>x.name===instance&&x.pinnedHostKey)) throw new Error('SSH instance is missing or not trusted');
        if (!accounts.some(x=>x.instance===instance&&x.provider===provider&&x.account===account&&x.status==='connected')) throw new Error('SSH subscription account is not connected');
        return { url: provider === 'codex' ? 'https://chatgpt.com/backend-api/codex/responses' : 'https://api.anthropic.com/v1/messages',
            apiKey: 'ssh-remote', modelId, provider, account: `ssh.${instance}.${account}`, kind: 'subscription',
            api: provider === 'codex' ? 'responses' : 'anthropic', ssh: {instance,provider,account} };
    }
    const m = /^([a-z][\w\-]*)(?:\/([\w\-.]+))?:(.+)$/.exec(model);
    const provider = m ? m[1]! : "lmstudio";
    const account = (m?.[2] ?? "default");
    const modelId = m ? m[3]! : model;
    // hyper/<node>:<model> — another Hyper relays the call through its own
    // provider (docs/hyper-node.md). The wire api and billing kind come from the
    // node's cached catalogue; the bearer is our client token for that node.
    if (provider === "hyper") {
        const node = await ctx.fns.node.get({ name: account });
        if (!node || !node.enabled) throw new Error(`hyper node not configured: ${account}`);
        const matches = node.catalog?.filter((e) => e.id === modelId) ?? [];
        // Bare IDs from older saved agents are safe only when unambiguous.
        if (!matches.length && !modelId.includes(":")) matches.push(...(node.catalog ?? []).filter((e) => e.id.slice(e.id.indexOf(":") + 1) === modelId));
        if (matches.length > 1) throw new Error(`hyper/${account} model ${modelId} is ambiguous; select provider/account:model`);
        const entry = matches[0];
        if (!entry) throw new Error(`hyper/${account} does not offer model ${modelId}`);
        if (!["openai", "anthropic", "responses", "mock"].includes(String(entry.api))) throw Object.assign(new Error(`hyper/${account}: provider unavailable`), { retryable: false, replaySafe: false });
        const path = entry.api === "openai" ? "chat" : entry.api;
        return { url: `${node.url}/${path}`, apiKey: await ctx.fns.node.token({ name: account }), modelId: entry.id, provider, account, kind: entry.kind, api: entry.api, upstream: entry.provider, quotaAccount: `${account}/${entry.provider}/${entry.account ?? "default"}` };
    }
    if (provider === "oneapi") {
        const baseUrl = (await declaredString('oneapiBaseUrl')(ctx))?.replace(/\/+$/, '');
        if (!baseUrl) throw new Error('One API is not configured: set llm.oneapiBaseUrl including /v1');
        return { url: `${baseUrl}/chat/completions`, apiKey: await declaredSecret('oneapiApiKey')(ctx), modelId, provider, account, kind: "api", api: "openai" };
    }
    const p = PROVIDERS[provider];
    if (!p) throw new Error(`unknown provider: ${provider}`);

    // baseUrl + apiKey come from the provider's resolveBaseUrl/resolveApiKey,
    // which themselves consult declared settings (src/llm/$setting_*.ts).
    const baseUrl = await p.resolveBaseUrl(ctx);
    const apiKey = p.resolveApiKey ? await p.resolveApiKey(ctx, account) : null;
    const url = p.api === "anthropic" ? `${baseUrl}/v1/messages`
        : p.api === "responses" ? `${baseUrl}/responses`
            : `${baseUrl}/chat/completions`;
    return { url, apiKey, modelId, provider, account, kind: p.kind, api: p.api };
}

type ProviderConfig = {
    api: "openai" | "anthropic" | "responses" | "mock";
    // subscription = fixed quota per rolling window; a 429 means "wait until it
    // resets", money cannot fix it, so agents get parked. api = pay-per-token;
    // a 429 is short throttling and stays a normal retry. local = no limits.
    kind: "subscription" | "api" | "local";
    resolveBaseUrl: (ctx: Context) => string | Promise<string>;
    resolveApiKey?: (ctx: Context, account: string) => string | null | Promise<string | null>;
};

// Secret declarations contain either a provider reference (env://, op://) or a
// legacy literal. Resolution is centralized in the secrets namespace.
const declaredSecret = (key: string) => async (ctx: Context): Promise<string | null> => {
    return ctx.fns.secrets.resolveSetting({ module: 'llm', scopeType: 'global', key });
};

const declaredString = (key: string) => async (ctx: Context): Promise<string | null> => {
    const v = await ctx.fns.settings.getString({ module: 'llm', scopeType: 'global', key });
    return (typeof v === 'string' && v) ? v : null;
};

function decodeJwtExp(token: string): number | null {
    try {
        const payload = token.split(".")[1];
        if (!payload) return null;
        const json = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
        return typeof json.exp === "number" ? json.exp : null;
    } catch { return null; }
}

const PROVIDERS: Record<string, ProviderConfig> = {
    "zai-coding": {
        api: "openai",
        kind: "subscription",
        // Keep subscription traffic separate from the standard, metered API.
        resolveBaseUrl: () => "https://api.z.ai/api/coding/paas/v4",
        resolveApiKey: declaredSecret('zaiCodingApiKey'),
    },
    "minimax-coding": {
        // MiniMax M Plan subscription — Anthropic-messages protocol, the route
        // MiniMax recommends for coding tools. Keep subscription traffic
        // separate from the standard, metered MiniMax API.
        api: "anthropic",
        kind: "subscription",
        resolveBaseUrl: () => "https://api.minimax.io/anthropic",
        resolveApiKey: declaredSecret('minimaxCodingApiKey'),
    },
    lmstudio: {
        api: "openai",
        kind: "local",
        // src/llm/$setting_lmstudioBaseUrl.ts handles env LMSTUDIO_URL → default.
        resolveBaseUrl: async (ctx) => ((await declaredString('lmstudioBaseUrl')(ctx)) ?? 'http://localhost:1234') + '/v1',
    },
    kimi: {
        // Moonshot-AI OpenAI-compat (NOT the kimi.com/coding subscription — use kimi-coding: for that)
        api: "openai",
        kind: "api",
        resolveBaseUrl: () => "https://api.moonshot.ai/v1",
        resolveApiKey: declaredSecret('kimiApiKey'),
    },
    "kimi-coding": {
        // Kimi coding subscription — Anthropic-messages protocol.
        // Token is read fresh from ~/.kimi/credentials/kimi-code.json on every
        // call (no caching). JWT exp is checked; expired tokens return null so
        // the caller fails loud instead of silently using a stale token.
        api: "anthropic",
        kind: "subscription",
        resolveBaseUrl: () => "https://api.kimi.com/coding",
        resolveApiKey: (ctx, account) => {
            if (account === "default" && ctx.env.KIMI_CODING_API_KEY) return ctx.env.KIMI_CODING_API_KEY;
            try {
                const { readFileSync } = require("node:fs");
                const { file } = ctx.fns.llm.accountCredentialPath({ provider: "kimi-coding", account });
                const raw = readFileSync(file!, "utf8");
                const j = JSON.parse(raw);
                const tok = j.access_token;
                if (!tok) return null;
                const exp = decodeJwtExp(tok);
                const now = Math.floor(Date.now() / 1000);
                if (exp && exp < now - 5) {
                    console.warn(`[kimi-coding] token expired ${now - exp}s ago — run \`kimi login\` to refresh`);
                    return null;
                }
                return tok;
            } catch (e: any) {
                console.warn(`[kimi-coding] cannot read credentials: ${e?.message}`);
                return null;
            }
        },
    },
    anthropic: {
        api: "anthropic",
        kind: "api",
        resolveBaseUrl: () => "https://api.anthropic.com",
        resolveApiKey: declaredSecret('anthropicApiKey'),
    },
    "claude-code": {
        // Anthropic subscription via the Claude Code CLI's keychain entry.
        // Token is fetched/refreshed in streamAnthropic at request time.
        api: "anthropic",
        kind: "subscription",
        resolveBaseUrl: () => "https://api.anthropic.com",
        resolveApiKey: () => null,
    },
    "anthropic-oauth": {
        // Managed Claude Pro/Max OAuth. Decryption + refresh happen lazily in
        // streamAnthropic, immediately before the request.
        api: "anthropic",
        kind: "subscription",
        resolveBaseUrl: () => "https://api.anthropic.com",
        resolveApiKey: () => null,
    },
    xai: {
        // SuperGrok / X Premium subscription via xAI Device OAuth.
        // The access token is decrypted/refreshed lazily by streamXai.
        api: "responses",
        kind: "subscription",
        resolveBaseUrl: () => "https://api.x.ai/v1",
        resolveApiKey: () => null,
    },

    openai: {
        api: "openai",
        kind: "api",
        resolveBaseUrl: () => "https://api.openai.com/v1",
        resolveApiKey: declaredSecret('openaiApiKey'),
    },
    groq: {
        api: "openai",
        kind: "api",
        resolveBaseUrl: () => "https://api.groq.com/openai/v1",
        resolveApiKey: declaredSecret('groqApiKey'),
    },
    openrouter: {
        api: "openai",
        kind: "api",
        resolveBaseUrl: () => "https://openrouter.ai/api/v1",
        resolveApiKey: declaredSecret('openrouterApiKey'),
    },
    mock: {
        api: "mock",
        kind: "local",
        resolveBaseUrl: () => "mock://local",
    },
    codex: {
        // OpenAI ChatGPT subscription via Codex backend (Responses API).
        // Uses ~/.codex/auth.json (same file `codex` CLI maintains).
        // streamCodex() always re-asks refreshCodex() right before sending,
        // so an expired access_token here is fine — it gets refreshed there.
        api: "responses",
        kind: "subscription",
        resolveBaseUrl: () => "https://chatgpt.com/backend-api/codex",
        resolveApiKey: (ctx, account) => {
            try {
                const { readFileSync } = require("node:fs");
                const { file } = ctx.fns.llm.accountCredentialPath({ provider: "codex", account });
                const raw = readFileSync(file!, "utf8");
                return JSON.parse(raw)?.tokens?.access_token ?? null;
            } catch { return null; }
        },
    },
};
