/**
 * Read the official OpenCode Go comparison figures for exact model routes.
 *
 * Fetch opencode.ai/go and its official Go endpoint documentation without credentials.
 * Return published estimated requests per five hours and monthly usage limits for
 * Go and Go Plus, not per-token API prices or live remaining quota. Cache for one
 * hour and retain the last successful snapshot with its original timestamp on failure.
 * Ignore every non-OpenCode route and never change provider settings or call inference.
 * @param opts.models Exact model routes; non-OpenCode providers are ignored.
 * @param opts.nodes Saved Hyper node catalogue for billing classification only.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Exact routes to compare; non-OpenCode providers cause no requests. */ models: string[];
    /** Saved node billing information; no remote credentials or settings are read. */ nodes?: types.node.NodeEntry[];
}): Promise<Record<string, types.llm.ModelPrice>> {
    const models = opts.models.filter(model => /^(?:(?:ssh|hyper)\/[^:]+:)*opencode(?:\/[\w.-]+)?:/.test(model));
    if (!models.length) return {};
    const localPlan = models.some(m=>/^opencode(?:\/[^:]+)?:/.test(m)) ? await ctx.fns.settings.getString({module:'llm',scopeType:'global',key:'opencodePlan'}) : undefined;
    type Snapshot = Awaited<ReturnType<typeof ctx.fns.llm.opencodeGoComparison>>;
    const state = ctx.state as typeof ctx.state & {opencodeGoComparison?: {version?:number;attemptAt:number;updatedAt?:number;data?:Snapshot;pending?:Promise<void>}};
    const cache = state.opencodeGoComparison ??= {attemptAt:0};
    if (cache.version !== 2 || !cache.attemptAt || Date.now()-cache.attemptAt>(cache.data?3600000:60000)) {
        cache.pending ??= (async()=>{
            try {
                const responses=await Promise.all([
                    fetch('https://opencode.ai/go',{headers:{Accept:'text/html'},redirect:'error',signal:AbortSignal.timeout(20000)}),
                    fetch('https://opencode.ai/v2/docs/console/go',{headers:{Accept:'text/markdown'},redirect:'error',signal:AbortSignal.timeout(20000)}),
                ]);
                if(responses.some(r=>!r.ok))throw new Error('Official Go comparison unavailable');
                const [html,markdown]=await Promise.all(responses.map(r=>r.text()));
                cache.data=await ctx.fns.llm.opencodeGoComparison({html:html!,markdown:markdown!});
                cache.updatedAt=Date.now();cache.version=2;
            } catch {
                await ctx.fns.procs.log.warn({event:'llm.go-comparison.unavailable',msg:'Official Go comparison unavailable; keeping last successful snapshot'});
            } finally {cache.attemptAt=Date.now();delete cache.pending;}
        })();
        await cache.pending;
    }
    const out:Record<string,types.llm.ModelPrice>={};
    for(const route of models){
        const match=/^(?:(?:ssh|hyper)\/[^:]+:)*opencode(?:\/[\w.-]+)?:(.+)$/.exec(route);
        const node=/^hyper\/([^:]+):(.+)$/.exec(route);
        const kind=node?opts.nodes?.find(n=>n.name===node[1])?.catalog?.find(e=>e.id===node[2])?.kind:undefined;
        const remote=/^(?:ssh|hyper)\//.test(route);
        const billing:types.llm.ModelPrice['billing']=kind??(!remote?(localPlan==='go'?'subscription':'api'):'unknown');
        out[route]={billing,...cache.data?.[match?.[1]??''],source:'https://opencode.ai/go',updatedAt:cache.updatedAt,note:'Official Go / Go Plus estimates, not remaining quota or PAYG prices. Actual request sizes vary; limits are shared, not additive per model.'};
    }
    return out;
}
