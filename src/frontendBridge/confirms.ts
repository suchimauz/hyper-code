/**
 * Read and answer native confirm (yes/no) inputs for the authenticated React chat
 *
 * Use for owner-only JSON confirm cards bound to one active agent. GET lists only kind=confirm inputs with a whitelisted projection (details markdown, labels, danger, confirmed/comment result). POST accepts {id, decision:'yes'|'no', comment?} and delivers it through the native input.submit, so the agent receives the same input-result as from the classic card. Other input kinds (secret, grid, Redmine approvals) are never exposed or answered here.
 * @param opts.req Same-origin GET list or CSRF-protected JSON POST with agentId query and id, decision and optional comment body fields.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Same-origin GET list or CSRF-protected JSON POST with agentId query and id, decision and optional comment body fields. */
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
     const s=input.spec??{},r=input.result;
     const result=r&&typeof r.confirmed==='boolean'?{confirmed:r.confirmed,...(typeof r.comment==='string'?{comment:r.comment}:{})}:null;
     return {id:input.id,agentId:input.agentId,kind:'confirm',title:input.title,message:input.message,state:input.state,
      spec:{details:typeof s.details==='string'?s.details:'',confirmLabel:typeof s.confirmLabel==='string'?s.confirmLabel:'Confirm',declineLabel:typeof s.declineLabel==='string'?s.declineLabel:'Decline',danger:s.danger===true},
      result,createdAt:input.createdAt,updatedAt:input.updatedAt};
    };
    if(req.method==='GET'){
     const rows=await ctx.fns.procs.db.select({sql:"SELECT id FROM inputs WHERE agent_id = ? AND kind = 'confirm' ORDER BY created_at, id",params:[agentId]});
     const inputs=[];
     for(const row of rows){const input=await ctx.fns.input.get({id:String(row.id)});if(input?.kind==='confirm'&&input.agentId===agentId)inputs.push(project(input));}
     return reply({version:1,agentId,csrfToken:await ctx.fns.auth.csrfToken({req}),inputs});
    }
    if(!await ctx.fns.auth.verifyCsrf({req,token:req.headers.get('x-csrf-token')??''}))return reply({error:'Invalid request token'},403);
    if(req.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')return reply({error:'JSON body required'},415);
    if(Number(req.headers.get('content-length')??0)>16384)return reply({error:'Request too large'},413);
    const raw=await req.text();if(raw.length>16384)return reply({error:'Request too large'},413);
    let data:Record<string,unknown>;try{data=JSON.parse(raw);}catch{return reply({error:'Invalid JSON'},400);}
    if(!data||Array.isArray(data)||typeof data!=='object'||Object.keys(data).some(k=>!['id','decision','comment'].includes(k))||typeof data.id!=='string'||data.id.length>128)return reply({error:'Invalid confirm answer'},400);
    if(data.decision!=='yes'&&data.decision!=='no')return reply({error:'Invalid decision'},400);
    if('comment' in data&&(typeof data.comment!=='string'||data.comment.length>2000))return reply({error:'Invalid comment'},400);
    const input=await ctx.fns.input.get({id:data.id});
    if(!input||input.agentId!==agentId||input.kind!=='confirm')return reply({error:'Confirm not found'},404);
    if(input.state!=='open')return reply({state:input.state,error:'Confirm is already closed'},409);
    const values:Record<string,string>={decision:data.decision};
    const comment=typeof data.comment==='string'?data.comment.trim():'';
    if(comment)values.comment=comment;
    const out=await ctx.fns.input.submit({id:input.id,values,actor:user.id});
    return reply(out,out.error?400:out.state==='processing'?409:200);
}
