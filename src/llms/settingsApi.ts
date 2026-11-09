/**
 * Read and update owner-only model policy and coding-plan settings for React.
 *
 * Use from the native LLM settings panel. Returns only model routes, trusted instance names, admission tier and safe node summaries. Writes require owner authentication, same origin and cookie-bound CSRF; never returns stored credentials or starts login. Token issuance requires explicit confirmation and returns the new token once with no-store headers.
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
    const who = await ctx.fns.auth.currentUser({req:opts.req});
    const { user } = who;
    if (who.required && !user && !who.legacy) return reply({error:'Unauthorized'},401);
    if (user && user.role !== 'owner') return reply({error:'Owner required'},403);
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
     if (data.action === 'node-save') {
      if (typeof data.name !== 'string' || typeof data.url !== 'string' || typeof data.token !== 'string') return reply({error:'Name, URL and token field required'},400);
      let url: URL;
      try { url = new URL(data.url); } catch { return reply({error:'Invalid node URL'},400); }
      if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !/^[a-z][\w.-]{0,31}$/i.test(data.name)) return reply({error:'Invalid node name or URL'},400);
      try { await ctx.fns.node.add({name:data.name,url:url.href,token:data.token}); } catch { return reply({error:'Node saved but connection failed; check URL and credentials.'},400); }
     } else if (data.action === 'node-refresh') {
      if (typeof data.name !== 'string') return reply({error:'Node name required'},400);
      await ctx.fns.node.refresh({name:data.name});
     } else if (data.action === 'client-issue') {
      if (data.confirmed !== true || typeof data.name !== 'string' || !data.name.trim() || !Array.isArray(data.providers) || !data.providers.every(p=>typeof p === 'string' && /^[\w-]+$/.test(p))) return reply({error:'Explicit confirmation, name and providers required'},400);
      return reply(await ctx.fns.node.issueClient({name:data.name,providers:data.providers as string[]}));
     } else if (data.action === 'client-revoke') {
      if (data.confirmed !== true || typeof data.id !== 'string' || !data.id) return reply({error:'Explicit confirmation and client ID required'},400);
      return reply(await ctx.fns.node.revokeClient({id:data.id}));
     } else if (data.action === 'model') {
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
    const [models, policy, instances, nodes, tier, zai, minimax, opencode, clients] = await Promise.all([
     ctx.fns.llm.listModels({}), ctx.fns.llm.modelPolicy({action:'list'}), ctx.fns.sshInstance.list({}), ctx.fns.node.list({}),
     ctx.fns.settings.getString({module:'llm',scopeType:'global',key:'minimaxCodingServiceTier'}),
     ctx.fns.llm.codingInstance({provider:'zai-coding'}),ctx.fns.llm.codingInstance({provider:'minimax-coding'}),ctx.fns.llm.codingInstance({provider:'opencode'}), ctx.fns.node.clients({})
    ]);
    return reply({models:[...new Set([...Object.values(models).flat(),...policy.disabledModels])].sort(),disabledModels:policy.disabledModels,instances:instances.filter(i=>!!i.pinnedHostKey).map(i=>i.name),plans:{'zai-coding':zai.instance || '', 'minimax-coding':minimax.instance || '',opencode:opencode.instance || ''},tier:tier === 'priority' ? 'priority':'standard',clients, nodes:nodes.map(n=>({name:n.name,url:(()=>{try {const u=new URL(n.url);u.username='';u.password='';u.search='';u.hash='';return u.href;}catch{return '';}})(),enabled:n.enabled,modelCount:n.catalog?.length ?? 0,catalogAt:n.catalogAt,usageAt:n.usageAt})),csrfToken:await ctx.fns.auth.csrfToken({req})});
}
