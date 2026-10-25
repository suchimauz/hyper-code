/**
 * Discover OpenCode models using official plan-specific endpoint tables
 *
 * Official Console endpoint rows determine transport, never models.dev SDK packages or URLs. Authenticated discovery intersects IDs; public pay-as-you-go chat rows remain available without a key. Optional models.dev data enriches limits and effort controls only. Cached reads are network-free and scoped to plan and credential identity.
 * @param opts.refresh Bypass the five-minute plan and credential scoped cache. @default false
 * @param opts.cachedOnly Read matching cached metadata without network requests. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Bypass the five-minute plan and credential scoped cache. @default false */
        refresh?: boolean;
        /** Read matching cached metadata without network requests. @default false */
        cachedOnly?: boolean;
    },
): Promise<{models:Array<{id:string;api:"openai"|"anthropic"|"responses"|"gemini";baseUrl:string;public:boolean;context?:number;output?:number;toolCall:boolean;reasoning:types.llm.ReasoningProfile;reasoningOptions:Array<{type:string;values?:string[]}>}>;updatedAt:number}> {
    type Catalog = Awaited<ReturnType<typeof ctx.fns.llm.opencodeCatalog>>;
    const plan = await ctx.fns.settings.getString({module:'llm',scopeType:'global',key:'opencodePlan'}) === 'go' ? 'go' : 'payg';
    const key = await ctx.fns.secrets.resolveSetting({module:'llm',scopeType:'global',key:'opencodeApiKey'});
    const identity = plan + ':' + (key ? Bun.hash(key).toString(16) : 'anonymous');
    const state = ctx.state as typeof ctx.state & { llm?: { opencodeCatalog?: { identity?: string; value?: Catalog; pending?: Promise<Catalog> } } };
    const caches = (state.llm ??= {});
    if (caches.opencodeCatalog?.identity !== identity) caches.opencodeCatalog = {identity};
    const cache = caches.opencodeCatalog!;
    if (opts.cachedOnly) return cache.value ?? {models:[],updatedAt:0};
    if (plan === 'go' && !key) return {models:[],updatedAt:0};
    if (!opts.refresh && cache.value && Date.now() - cache.value.updatedAt < 300000) return cache.value;
    if (cache.pending) return cache.pending;
    const pending = (async (): Promise<Catalog> => {
        const prefix = plan === 'go' ? 'https://opencode.ai/inference/go' : 'https://opencode.ai/inference';
        const [docsResponse, idsResponse, metadata] = await Promise.all([
            ctx.fns.llm.opencodeFetch({url:'https://opencode.ai/v2/docs/console/'+(plan === 'go' ? 'go' : 'models'),init:{method:'GET',signal:AbortSignal.timeout(20000)}}),
            key ? ctx.fns.llm.opencodeFetch({url:prefix+'/v1/models',init:{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000)}}) : Promise.resolve(null),
            (async () => {
                try {
                    const response = await fetch('https://models.dev/api.json',{redirect:'error',signal:AbortSignal.timeout(20000)});
                    return response.ok ? await response.json() as Record<string,{models?:Record<string,{limit?:{context?:number;output?:number};tool_call?:boolean;reasoning_options?:Array<{type:string;values?:string[]}>}>}> : {};
                } catch (error) {
                    await ctx.fns.procs.log.warn({event:'llm.opencode.metadata',msg:'Optional model metadata unavailable'});
                    return {};
                }
            })(),
        ]);
        if (!docsResponse.ok || (idsResponse && !idsResponse.ok)) throw new Error('OpenCode catalogue discovery failed');
        const routes = await ctx.fns.llm.opencodeDocumentedRoutes({markdown:await docsResponse.text(),plan});
        let ids: Set<string> | undefined;
        if (idsResponse) {
            const payload = await idsResponse.json() as {data?:Array<{id?:string}>};
            if (!Array.isArray(payload.data)) throw new Error('Invalid OpenCode catalogue response');
            ids = new Set(payload.data.map(m=>m.id).filter((id):id is string=>typeof id === 'string'));
        }
        const models: Catalog['models'] = [];
        for (const route of routes) {
            if (ids ? !ids.has(route.id) : !route.public) continue;
            const m = metadata[plan === 'go' ? 'opencode-go' : 'opencode']?.models?.[route.id];
            const reasoningOptions = (m?.reasoning_options ?? []).filter(o=>['effort','toggle','budget_tokens'].includes(o.type)).map(o=>({type:o.type,...(Array.isArray(o.values)?{values:o.values.filter(v=>typeof v === 'string')}:{})}));
            const values = reasoningOptions.find(o=>o.type === 'effort')?.values ?? [];
            const supported: types.llm.ReasoningEffort[] = ['auto'];
            for (const value of values) {
                const mapped = value === 'none' ? 'off' : value === 'max' && !values.includes('xhigh') ? 'xhigh' : value;
                if (['off','minimal','low','medium','high','xhigh'].includes(mapped) && !supported.includes(mapped as types.llm.ReasoningEffort)) supported.push(mapped as types.llm.ReasoningEffort);
            }
            const reasoning: types.llm.ReasoningProfile = supported.length > 1 && route.api !== 'gemini' ? {supported,defaultEffort:'off',mode:route.api === 'anthropic' ? 'anthropic-adaptive' : 'openai-effort'} : {supported:['auto','off'],defaultEffort:'off',mode:'none'};
            const positive = (v:number|undefined)=>typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
            models.push({...route,context:positive(m?.limit?.context),output:positive(m?.limit?.output),toolCall:m?.tool_call !== false,reasoning,reasoningOptions});
        }
        return cache.value = {models,updatedAt:Date.now()};
    })();
    cache.pending = pending;
    try { return await pending; } finally { if (cache.pending === pending) delete cache.pending; }
}
