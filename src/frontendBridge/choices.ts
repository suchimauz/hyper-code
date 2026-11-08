/**
 * Read and submit native choice inputs for the authenticated React chat
 *
 * Use for owner-only JSON choice cards bound to one active agent. GET includes an authoritative batch revision; POST accepts revision plus all answers for atomic choiceBatch delivery, or the legacy single answer/cancel shape. Validates explicit other selection and excludes all other input kinds.
 * @param opts.req Same-origin GET list or CSRF-protected JSON POST with agentId query and id and either cancel:true or value/values, otherSelected and optional other body fields.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Same-origin GET list or CSRF-protected JSON POST with agentId query and id and either cancel:true or value/values, otherSelected and optional other body fields. */
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
    const project=(input:types.input.Row)=>{
     const options=(Array.isArray(input.spec.options)?input.spec.options:[]).filter((o:{value?:string;label?:string})=>typeof o?.value==='string'&&typeof o?.label==='string').map((o:{value:string;label:string;description?:string})=>({value:o.value,label:o.label,...(typeof o.description==='string'?{description:o.description}:{})}));
     const multiple=input.spec.multiple===true,allowOther=input.spec.allowOther===true,known=new Set(options.map(o=>o.value));
     const r=input.result;
     const result=r?{...(multiple?{values:Array.isArray(r.values)?r.values.filter((v:string)=>typeof v==='string'&&known.has(v)):[]}:typeof r.value==='string'&&known.has(r.value)?{value:r.value}:{}),...(allowOther&&typeof r.other==='string'?{other:r.other}:{})}:null;
     return {id:input.id,agentId:input.agentId,kind:'choice',title:input.title,message:input.message,state:input.state,spec:{options,multiple,allowOther},...(input.state==='submitted'&&typeof input.spec._choiceBatchId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.spec._choiceBatchId)?{batchId:input.spec._choiceBatchId}:{}),result,createdAt:input.createdAt,updatedAt:input.updatedAt};
    };
    if(req.method==='GET')return (await ctx.fns.procs.db.transaction({fn:async()=>{
     await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id=? FOR UPDATE',params:[agentId]});
     const rows=await ctx.fns.procs.db.select({sql:"SELECT id FROM inputs WHERE agent_id = ? AND kind = 'choice' ORDER BY created_at, id",params:[agentId]});
     const inputs=[];
     for(const row of rows){const input=await ctx.fns.input.get({id:String(row.id)});if(input?.kind==='choice'&&input.agentId===agentId)inputs.push(project(input));}
     const snapshot=await ctx.fns.input.choiceBatch({agentId});
     return reply({version:1,agentId,csrfToken:await ctx.fns.auth.csrfToken({req}),inputs,batch:snapshot.inputIds.length?{revision:snapshot.revision,inputIds:snapshot.inputIds}:null});
    }})) as Response;
    if(!await ctx.fns.auth.verifyCsrf({req,token:req.headers.get('x-csrf-token')??''}))return reply({error:'Invalid request token'},403);
    if(req.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')return reply({error:'JSON body required'},415);
    if(Number(req.headers.get('content-length')??0)>16384)return reply({error:'Request too large'},413);
    const raw=await req.text();if(raw.length>16384)return reply({error:'Request too large'},413);
    let data:Record<string,unknown>;try{data=JSON.parse(raw);}catch{return reply({error:'Invalid JSON'},400);}
    if(data&&typeof data==='object'&&!Array.isArray(data)&&('revision' in data||'answers' in data)){
     if(Object.keys(data).some(k=>!['revision','answers'].includes(k))||typeof data.revision!=='string'||!/^[a-f0-9]{64}$/.test(data.revision)||!Array.isArray(data.answers)||!data.answers.length||data.answers.length>100||data.answers.some(a=>!a||typeof a!=='object'||Array.isArray(a)||typeof a.id!=='string'))return reply({error:'Invalid batch'},400);
     try{
      const out=await ctx.fns.input.choiceBatch({agentId,revision:data.revision,answers:data.answers as Array<{id:string;value?:string;values?:string[];otherSelected:boolean;other?:string}>,actor:user.id});
      return reply(out);
     }catch(error){const message=error instanceof Error?error.message:'Batch failed';return reply({error:message},message==='Stale batch'?409:400);}
    }
    if(!data||Array.isArray(data)||typeof data!=='object'||Object.keys(data).some(k=>!['id','value','values','otherSelected','other','cancel'].includes(k))||typeof data.id!=='string'||data.id.length>128)return reply({error:'Invalid choice answer'},400);
    const cancel=data.cancel===true;
    if(cancel?Object.keys(data).some(k=>!['id','cancel'].includes(k)):('cancel' in data||typeof data.otherSelected!=='boolean'))return reply({error:'Invalid choice action'},400);
    const input=await ctx.fns.input.get({id:data.id});
    if(!input||input.agentId!==agentId||input.kind!=='choice')return reply({error:'Choice not found'},404);
    if(input.state!=='open')return reply({state:input.state,error:'Choice is already closed'},409);
    if(cancel){
     const out=await ctx.fns.input.submit({id:input.id,cancel:true,actor:user.id});
     return reply(out,out.error?400:out.state==='processing'?409:200);
    }
    const spec=project(input).spec;
    if(('value' in data&&typeof data.value!=='string')||('values' in data&&(!Array.isArray(data.values)||data.values.some(v=>typeof v!=='string')))||('value' in data&&'values' in data)||(!spec.multiple&&'values' in data)||(spec.multiple&&'value' in data))return reply({error:'Invalid selection'},400);
    const picks: string[]=spec.multiple?(data.values as string[]??[]):typeof data.value==='string'?[data.value]:[];
    if(picks.length>30||new Set(picks).size!==picks.length||picks.some(v=>!spec.options.some(o=>o.value===v)))return reply({error:'Unknown or duplicate option'},400);
    const selectedOther=data.otherSelected;
    if((!selectedOther&&'other' in data)||(selectedOther&&(!spec.allowOther||typeof data.other!=='string'||!data.other.trim()||data.other.length>2000))||(!spec.multiple&&selectedOther&&picks.length)||(!selectedOther&&!picks.length))return reply({error:'Invalid other selection'},400);
    const values:Record<string,string|string[]>={pick:picks};
    if(selectedOther)values.other=(data.other as string).trim();
    const out=await ctx.fns.input.submit({id:input.id,values,actor:user.id});
    return reply(out,out.error?400:out.state==='processing'?409:200);
}
