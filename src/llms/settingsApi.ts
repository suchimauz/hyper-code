/**
 * Read and update owner-only model policy and coding-plan settings for React.
 *
 * Use from the native LLM settings panel. Returns only model routes, trusted instance names, admission tier and safe node summaries. Writes require owner authentication, same origin and cookie-bound CSRF; never returns credentials or starts login.
 * @param opts.req Owner GET or JSON POST with cookie-bound CSRF token.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Owner GET or JSON POST with cookie-bound CSRF token. */
        req: Request;
    },
): Promise<Response> {
    const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
    const user = (session as Session & { user?: { role?: string } })?.user;
    if (!user) return reply({error:'Unauthorized'},401);
    if (user.role !== 'owner') return reply({error:'Owner required'},403);
    const req = opts.req;
    if (!['GET','POST'].includes(req.method)) return reply({error:'Method not allowed'},405);
    if (req.method === 'POST') {
     if (req.headers.get('sec-fetch-site') === 'cross-site' || (req.headers.has('origin') && req.headers.get('origin') !== await ctx.fns.http.publicOrigin({req}))) return reply({error:'Same origin required'},403);
     if (!await ctx.fns.auth.verifyCsrf({req,token:req.headers.get('x-csrf-token') || ''})) return reply({error:'Invalid request token'},403);
     if (req.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') return reply({error:'JSON required'},415);
     const raw = await req.text();
     if (raw.length > 8192) return reply({error:'Request too large'},413);
     let data: Record<string, unknown>;
     try { data = JSON.parse(raw); } catch { return reply({error:'Invalid JSON'},400); }
     if (!data || typeof data !== 'object' || Array.isArray(data)) return reply({error:'Invalid request'},400);
     if (data.action === 'model') {
      if (typeof data.model !== 'string' || typeof data.disabled !== 'boolean') return reply({error:'Model and explicit disabled state required'},400);
      try { await ctx.fns.llm.modelPolicy({action:'set',model:data.model,disabled:data.disabled}); } catch { return reply({error:'Invalid model route'},400); }
     } else if (data.action === 'instance') {
      const keys = { 'zai-coding':'zaiCodingInstance','minimax-coding':'minimaxCodingInstance',opencode:'opencodeInstance' };
      if (typeof data.provider !== 'string' || !Object.hasOwn(keys,data.provider) || typeof data.instance !== 'string') return reply({error:'Invalid provider or instance'},400);
      const instance = data.instance;
      if (instance && !(await ctx.fns.sshInstance.list({})).some(i => i.name === instance && !!i.pinnedHostKey)) return reply({error:'Unknown or untrusted instance'},400);
      await ctx.fns.settings.set({module:'llm',scopeType:'global',key:keys[data.provider as keyof typeof keys],value:instance});
     } else if (data.action === 'tier') {
      if (data.tier !== 'standard' && data.tier !== 'priority') return reply({error:'Invalid tier'},400);
      await ctx.fns.settings.set({module:'llm',scopeType:'global',key:'minimaxCodingServiceTier',value:data.tier});
     } else return reply({error:'Unknown action'},400);
     return reply({ok:true});
    }
    const [models, policy, instances, nodes, tier, zai, minimax, opencode] = await Promise.all([
     ctx.fns.llm.listModels({}), ctx.fns.llm.modelPolicy({action:'list'}), ctx.fns.sshInstance.list({}), ctx.fns.node.list({}),
     ctx.fns.settings.getString({module:'llm',scopeType:'global',key:'minimaxCodingServiceTier'}),
     ctx.fns.llm.codingInstance({provider:'zai-coding'}),ctx.fns.llm.codingInstance({provider:'minimax-coding'}),ctx.fns.llm.codingInstance({provider:'opencode'})
    ]);
    return reply({models:[...new Set([...Object.values(models).flat(),...policy.disabledModels])].sort(),disabledModels:policy.disabledModels,instances:instances.filter(i=>!!i.pinnedHostKey).map(i=>i.name),plans:{'zai-coding':zai.instance || '', 'minimax-coding':minimax.instance || '',opencode:opencode.instance || ''},tier:tier === 'priority' ? 'priority':'standard',nodes:nodes.map(n=>({name:n.name,enabled:n.enabled,modelCount:n.catalog?.length ?? 0,catalogAt:n.catalogAt,usageAt:n.usageAt})),csrfToken:await ctx.fns.auth.csrfToken({req})});
}
