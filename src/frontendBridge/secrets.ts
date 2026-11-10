/**
 * List secret inputs of one agent for the React chat history, without values
 *
 * Use for owner-only JSON history rows of kind=secret inputs bound to one active agent. GET only; returns a whitelisted projection: title, message, state, target secret:// reference, mode and the stored reference result. Secret values never reach the input row, so none can be returned; nothing is submitted or answered here.
 * @param opts.req Same-origin authenticated GET with exactly one agentId query parameter.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Same-origin authenticated GET with exactly one agentId query parameter. */
        req: Request;
    },
): Promise<Response> {
    const headers = {'Cache-Control':'no-store','Vary':'Cookie'};
        const reply=(b:object,status=200)=>Response.json(b,{status,headers});
        const user=(session as Session & {user?:{id:string;role?:string}})?.user;
        if(!user)return reply({error:'Unauthorized'},401);
        if(user.role!=='owner')return reply({error:'Owner access required'},403);
        const req=opts.req,url=new URL(req.url);
        if(req.method!=='GET')return reply({error:'Method not allowed'},405);
        const origin=req.headers.get('origin');
        if((origin && origin!==url.origin)||req.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Same origin required'},403);
        const ids=url.searchParams.getAll('agentId');
        if(ids.length!==1||!/^[A-Za-z0-9_-]{1,128}$/.test(ids[0]!))return reply({error:'Invalid agentId'},400);
        const agentId=ids[0]!;
        const agents=await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id = ? AND archived_at IS NULL',params:[agentId]});
        if(!agents.length)return reply({error:'Agent not found'},404);
        const rows=await ctx.fns.procs.db.select({sql:"SELECT id FROM inputs WHERE agent_id = ? AND kind = 'secret' ORDER BY created_at, id",params:[agentId]});
        const inputs=[];
        for(const row of rows){
            const input=await ctx.fns.input.get({id:String(row.id)});
            if(input?.kind!=='secret'||input.agentId!==agentId)continue;
            const s=input.spec??{},r=input.result;
            inputs.push({id:input.id,agentId:input.agentId,kind:'secret' as const,title:input.title,message:input.message,state:input.state,
                spec:{saveAs:typeof s.saveAs==='string'?s.saveAs:'',mode:['password','otp','text'].includes(s.mode)?s.mode:'password'},
                result:r&&typeof r.ref==='string'?{ref:r.ref}:null,createdAt:input.createdAt,updatedAt:input.updatedAt});
        }
        return reply({version:1,agentId,inputs});
}
