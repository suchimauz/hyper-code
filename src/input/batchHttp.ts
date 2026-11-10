/**
 * Authorize owner-only batch HTTP operations and reject cross-site, oversized and malformed requests.
 *
 * Server-side atomic batch collection support; use through the dedicated owner-authorized batch routes.
 * @param opts.req Owner browser request with same-origin CSRF for mutations.
 * @param opts.params Batch route path parameters.
 * @param opts.operation Fixed operation selected by its route.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Owner browser request with same-origin CSRF for mutations. */
        req: Request;
        /** Batch route path parameters. */
        params?: Record<string, string>;
        /** Fixed operation selected by its route. */
        operation: "list" | "get" | "draft" | "submit" | "cancel" | "secret" | "search" | "field";
    },
): Promise<Response> {
    const req=opts.req,url=new URL(req.url),headers={'cache-control':'no-store',vary:'Cookie','x-content-type-options':'nosniff'};
    const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
    const user=(session as Session&{user?:{id:string;role?:string}})?.user;
    if(!user||user.role!=='owner')return reply({error:'Owner access required'},403);
    if(req.headers.get('sec-fetch-site')==='cross-site'||(req.headers.get('origin')&&req.headers.get('origin')!==url.origin))return reply({error:'Same origin required'},403);
    const write=['draft','submit','cancel','secret'].includes(opts.operation);
    if(req.method!==(write?'POST':'GET'))return reply({error:'Method not allowed'},405);
    if(write&&!await ctx.fns.auth.verifyCsrf({req,token:req.headers.get('x-csrf-token')??''}))return reply({error:'Invalid CSRF token'},403);
    const id=opts.params?.id??'';
    if(opts.operation==='list'){
     const agentId=url.searchParams.get('agentId')??'';
     const rows=await ctx.fns.procs.db.select({sql:"SELECT i.id FROM inputs i JOIN agents a ON a.id=i.agent_id WHERE i.agent_id=? AND a.archived_at IS NULL AND i.kind='batch' ORDER BY CASE WHEN i.state IN ('open','processing') THEN 0 ELSE 1 END,i.created_at DESC LIMIT 200",params:[agentId]});
     const inputs=[];for(const row of rows)inputs.push(await ctx.fns.input.batchSnapshot({id:row.id}));return reply({inputs,csrfToken:await ctx.fns.auth.csrfToken({req})});
    }
    const input=await ctx.fns.input.get({id});
    if(!input||input.kind!=='batch'||!(await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id=? AND archived_at IS NULL',params:[input.agentId]})).length)return reply({error:'Batch not found'},404);
    try{
     if(opts.operation==='get')return reply({...await ctx.fns.input.batchSnapshot({id,drafts:true}),csrfToken:await ctx.fns.auth.csrfToken({req})});
     const key=url.searchParams.get('key')??'';
     if(opts.operation==='field')return await ctx.fns.input.batchField({req,id,key});
     if(opts.operation==='search'){
     const item=input.spec.items.find((i:any)=>i.key===key);if(!item||item.kind!=='grid')return reply({error:'Grid not found'},404);
     const s=item.spec,q=(url.searchParams.get('q')??'').slice(0,200).toLocaleLowerCase();
     const rows=(s.rows??[]).map((row:any)=>({value:String(row[s.valueKey??'id']),cells:s.columns.map((c:any)=>String(row[c.key]??''))})).filter((row:any)=>!q||row.cells.some((v:string)=>v.toLocaleLowerCase().includes(q))).slice(0,100);
     return reply({rows,page:0});
     }
     if(!req.headers.get('content-type')?.startsWith('application/json'))return reply({error:'JSON required'},415);
     const reader=req.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
     if(reader){for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1_000_000){await reader.cancel();return reply({error:'Input too large'},413);}chunks.push(value);}}
     const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
     let data;try{data=JSON.parse(new TextDecoder().decode(all));}catch{return reply({error:'Invalid JSON'},400);}
     const allowed:Record<string,string[]>={draft:['revision','key','values','currentStep'],submit:['revision','requestId'],cancel:['revision'],secret:['revision','key','value']};
     if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!allowed[opts.operation]?.includes(k))||!Number.isSafeInteger(data.revision)||data.revision<0)return reply({error:'Invalid batch request'},400);
     if(opts.operation==='draft'||opts.operation==='secret'){
     if(typeof data.key!=='string')return reply({error:'Invalid member'},400);
     let values=data.values;
     if(opts.operation==='secret'){if(typeof data.value!=='string')return reply({error:'Invalid field'},400);values={value:data.value};}
     if(values!==undefined&&(!values||typeof values!=='object'||Array.isArray(values)||Object.entries(values).some(([k,v])=>['__proto__','constructor','prototype'].includes(k)||!(typeof v==='string'||Array.isArray(v)&&v.every(x=>typeof x==='string')))))return reply({error:'Invalid draft'},400);
     const out=await ctx.fns.input.batchDraft({id,revision:data.revision,key:data.key,values,currentStep:data.currentStep,secret:opts.operation==='secret'});
     if(opts.operation==='secret')return reply({state:out.state,revision:out.revision,filled:true});return reply(out);
     }
     return reply(await ctx.fns.input.batchAction({id,action:opts.operation as 'submit'|'cancel',revision:data.revision,requestId:data.requestId,actor:user.id}));
    }catch(e){const conflict=e instanceof Error&&e.message==='Batch conflict';const safe=(e as {batchError?:{code:string;message:string}}).batchError;return reply({error:safe??(conflict?'Batch changed; refresh before continuing':'Batch request could not be completed')},conflict?409:400);}
}
