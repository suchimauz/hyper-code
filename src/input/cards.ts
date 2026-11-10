/**
 * Return owner-only safe React input card projections for one active agent
 *
 * Use from the authenticated GET /input/cards route. Includes every pending card and the latest 100 terminal receipts, never raw results, errors or completion authority. Plugin specs require an explicit projectCard hook; core specs are allowlisted.
 * @param opts.req Same-origin authenticated browser GET request with agentId query parameter.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Same-origin authenticated browser GET request with agentId query parameter. */
        req: Request;
    },
): Promise<Response> {
    const req = opts.req, url = new URL(req.url);
    const headers = {'cache-control':'no-store',vary:'Cookie','x-content-type-options':'nosniff'};
    const reply = (body: object, status = 200) => Response.json(body,{status,headers});
    const user = (session as Session & {user?:{id:string;role?:string}})?.user;
    if (!user || user.role !== 'owner') return reply({error:'Owner access required'},403);
    if (req.method !== 'GET') return reply({error:'GET required'},405);
    if (req.headers.get('sec-fetch-site') === 'cross-site' || (req.headers.get('origin') && req.headers.get('origin') !== url.origin)) return reply({error:'Same origin required'},403);
    const agentId = url.searchParams.get('agentId') || '';
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(agentId)) return reply({error:'Invalid agent'},400);
    const rows = await ctx.fns.procs.db.select({sql:"WITH eligible AS (SELECT i.id,i.kind,i.state,i.title,i.message,i.spec,i.created_at,i.updated_at FROM inputs i JOIN agents a ON a.id=i.agent_id WHERE i.agent_id=? AND a.archived_at IS NULL), recent AS (SELECT * FROM eligible WHERE state NOT IN ('open','processing') ORDER BY created_at DESC,id DESC LIMIT 100) SELECT * FROM (SELECT * FROM eligible WHERE state IN ('open','processing') UNION ALL SELECT * FROM recent) cards ORDER BY created_at,id",params:[agentId]});
    const inputs: Record<string,unknown>[] = [];
    for (const row of rows) {
     const raw = typeof row.spec === 'string' ? JSON.parse(row.spec) : row.spec;
     const spec: Record<string,unknown> = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
     const input: types.input.Row = {id:String(row.id),agentId,kind:String(row.kind),state:row.state,title:String(row.title),message:String(row.message??''),spec,result:null,error:null,answeredBy:null,createdAt:Number(row.created_at),updatedAt:Number(row.updated_at)};
     let projected: Record<string,unknown> | null = null;
     const pick = (keys:string[]) => Object.fromEntries(keys.filter(k => typeof spec[k] === 'string').map(k => [k,spec[k]]));
     if(input.kind === 'secret') {
      projected = {...pick(['saveAs']),mode:['password','otp','text'].includes(String(spec.mode)) ? spec.mode : 'password'};
      if(typeof spec.maxlength === 'number' && Number.isSafeInteger(spec.maxlength) && spec.maxlength > 0) projected.maxlength=spec.maxlength;
     } else if(input.kind === 'choice') {
      projected={multiple:spec.multiple===true,allowOther:spec.allowOther===true,options:(Array.isArray(spec.options)?spec.options:[]).flatMap(o=>typeof o==='string'?[{value:o,label:o}]:o && typeof o.value==='string' && typeof o.label==='string'?[{value:o.value,label:o.label,...(typeof o.description==='string'?{description:o.description}:{})}]:[])};
     } else if(input.kind === 'confirm') {
      projected={...pick(['details','confirmLabel','declineLabel']),danger:spec.danger===true};
     } else if(input.kind === 'grid') {
      projected={multiple:spec.multiple===true,columns:(Array.isArray(spec.columns)?spec.columns:[]).flatMap(c=>c&&typeof c.key==='string'?[{key:c.key,label:typeof c.label==='string'?c.label:c.key}]:[])};
     } else {
      const kind = (ctx.state as Context['state'] & {input?:{kinds?:Record<string,types.input.Registered>}}).input?.kinds?.[input.kind];
      if(kind?.projectCard) {
       try { projected=await kind.projectCard(ctx,{input}); }
       catch { console.warn('Input card projection unavailable', {id:input.id,kind:input.kind}); projected=null; }
      }
     }
     // Scheduler keys and capabilities are never public even if a projector accidentally includes them.
     if(projected) projected=Object.fromEntries(Object.entries(projected).filter(([k])=>!k.startsWith('_')&&!['completionAuthority','result','error','answeredBy'].includes(k)));
     inputs.push({id:input.id,kind:input.kind,title:input.title,message:input.message,state:input.state,waitForAnswer:spec._agentWait===true,createdAt:input.createdAt,updatedAt:input.updatedAt,...(projected?{spec:projected}:{})});
    }
    return reply({inputs});
}
