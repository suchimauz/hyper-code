/**
 * Read, search and answer native grid (table pick) inputs for the authenticated React chat
 *
 * Use for owner-only JSON grid cards bound to one active agent. GET without id lists every kind=grid input of the agent with a whitelisted projection (title, message, column labels, multiple, and for submitted inputs only the visible column cells of picked rows for chat history). GET with id and q returns up to one page of matching rows as {value, cells} through the grid kind's own search, so source functions and inline rows stay server-side. POST accepts {id, values: string[]} or {id, cancel: true} and delivers it through the native input.submit, which re-resolves every picked value against the spec. Other input kinds are never exposed or answered here.
 * @param opts.req Same-origin GET list/search or CSRF-protected JSON POST with agentId query; POST body {id, values} or {id, cancel}.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Same-origin GET list/search or CSRF-protected JSON POST with agentId query; POST body {id, values} or {id, cancel}. */
        req: Request;
    },
): Promise<Response> {
    const headers = {'Cache-Control':'no-store','Vary':'Cookie'};
    const reply=(body:object,status=200)=>Response.json(body,{status,headers});
    const user=(session as Session & {user?:{id:string;role?:string}})?.user;
    if(!user)return reply({error:'Unauthorized'},401);
    if(user.role!=='owner')return reply({error:'Owner access required'},403);
    const req=opts.req,url=new URL(req.url);
    if(!['GET','POST'].includes(req.method))return reply({error:'Method not allowed'},405);
    const origin=req.headers.get('origin');
    if((origin && origin!==url.origin)||req.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Same origin required'},403);
    const ids=url.searchParams.getAll('agentId');
    if(ids.length!==1||!/^[A-Za-z0-9_-]{1,128}$/.test(ids[0]!))return reply({error:'Invalid agentId'},400);
    const agentId=ids[0]!;
    const agents=await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id = ? AND archived_at IS NULL',params:[agentId]});
    if(!agents.length)return reply({error:'Agent not found'},404);
    const kind=(ctx.state as {input?:{kinds?:Record<string,types.input.Registered>}}).input?.kinds?.grid;
    const load=async(id:string)=>{const input=await ctx.fns.input.get({id});return input&&input.kind==='grid'&&input.agentId===agentId?input:null;};
    const str=(v:unknown,d='')=>typeof v==='string'?v:d;
    const project=(input:types.input.Row)=>{
     const s=input.spec??{};
     const cols:{key?:unknown;label?:unknown}[]=Array.isArray(s.columns)?s.columns:[];
     const columns=cols.map(c=>({label:str(c?.label,str(c?.key))}));
     const cellOf=(v:unknown)=>v==null?'':typeof v==='object'?JSON.stringify(v):String(v);
     // History shows only the visible column cells of the picked rows, never whole row objects.
     const r=input.result,picked:unknown[]=input.state==='submitted'&&r?(Array.isArray(r.rows)?r.rows:r.row?[r.row]:[]):[];
     const result=input.state==='submitted'&&r?{rows:picked.slice(0,500).map(row=>cols.map(c=>cellOf((row as Record<string,unknown>|null)?.[String(c?.key)])))}:null;
     return {id:input.id,agentId:input.agentId,kind:'grid',title:input.title,message:input.message,state:input.state,
      spec:{columns,multiple:s.multiple===true},result,createdAt:input.createdAt,updatedAt:input.updatedAt};
    };
    if(req.method==='GET'){
     const id=url.searchParams.get('id');
     if(id!==null){
      const q=url.searchParams.get('q')??'';
      if(id.length>128||q.length>500||url.searchParams.getAll('q').length>1)return reply({error:'Invalid search'},400);
      const input=await load(id);
      if(!input)return reply({error:'Grid not found'},404);
      if(input.state!=='open'&&input.state!=='processing')return reply({state:input.state,error:'Grid is already closed'},409);
      if(!kind?.search)return reply({error:'Grid kind is not loaded'},503);
      try{return reply({id,q,...await kind.search(ctx,{input,q})});}
      catch(error){return reply({error:error instanceof Error?error.message:String(error)},502);}
     }
     const rows=await ctx.fns.procs.db.select({sql:"SELECT id FROM inputs WHERE agent_id = ? AND kind = 'grid' ORDER BY created_at, id",params:[agentId]});
     const inputs=[];
     for(const row of rows){const input=await load(String(row.id));if(input)inputs.push(project(input));}
     return reply({version:1,agentId,csrfToken:await ctx.fns.auth.csrfToken({req}),inputs});
    }
    if(!await ctx.fns.auth.verifyCsrf({req,token:req.headers.get('x-csrf-token')??''}))return reply({error:'Invalid request token'},403);
    if(req.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')return reply({error:'JSON body required'},415);
    if(Number(req.headers.get('content-length')??0)>65536)return reply({error:'Request too large'},413);
    const raw=await req.text();if(raw.length>65536)return reply({error:'Request too large'},413);
    let data:Record<string,unknown>;try{data=JSON.parse(raw);}catch{return reply({error:'Invalid JSON'},400);}
    if(!data||Array.isArray(data)||typeof data!=='object'||Object.keys(data).some(k=>!['id','values','cancel'].includes(k))||typeof data.id!=='string'||data.id.length>128)return reply({error:'Invalid grid answer'},400);
    const cancel=data.cancel===true;
    if('cancel' in data&&!cancel)return reply({error:'Invalid cancel'},400);
    if(cancel&&'values' in data)return reply({error:'Invalid grid answer'},400);
    if(!cancel&&(!Array.isArray(data.values)||!data.values.length||data.values.length>500||data.values.some(v=>typeof v!=='string'||v.length>1000)))return reply({error:'Invalid values'},400);
    const input=await load(data.id);
    if(!input)return reply({error:'Grid not found'},404);
    if(input.state!=='open')return reply({state:input.state,error:'Grid is already closed'},409);
    const out=cancel?await ctx.fns.input.submit({id:input.id,cancel:true,actor:user.id}):await ctx.fns.input.submit({id:input.id,values:{pick:data.values as string[]},actor:user.id});
    return reply(out,out.error?400:out.state==='processing'?409:200);
}
