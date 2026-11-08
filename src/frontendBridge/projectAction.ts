/**
 * Archive or restore one visible workspace without changing chat statuses
 *
 * Serve authenticated GET CSRF tokens and owner-only POST archive or restore requests for native personal project membership. Reject the unassigned virtual group; discovered exact workspaces are materialized by the native project action.
 * @param opts.req Incoming GET token request or CSRF-protected JSON POST containing projectId and archive or restore action.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming GET token request or CSRF-protected JSON POST containing projectId and archive or restore action. */
        req: Request;
    },
): Promise<Response> {
    const headers={'Cache-Control':'no-store','Vary':'Cookie'};
    const reply=(body:object,status=200)=>Response.json(body,{status,headers});
    const user=(session as Session & {user?:{id:string;role?:string}})?.user;
    if(!user)return reply({error:'Unauthorized'},401);
    if(user.role!=='owner')return reply({error:'Owner access required'},403);
    const req=opts.req;
    if(req.method==='GET')return reply({csrfToken:await ctx.fns.auth.csrfToken({req})});
    if(req.method!=='POST')return reply({error:'Method not allowed'},405);
    if(!await ctx.fns.auth.verifyCsrf({req,token:req.headers.get('x-csrf-token')||''}))return reply({error:'Invalid request token'},403);
    if(req.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')return reply({error:'JSON body required'},415);
    const raw=await req.text();if(raw.length>4096)return reply({error:'Request too large'},413);
    let data:{projectId?:string;action?:string};try{data=JSON.parse(raw);}catch{return reply({error:'Invalid JSON'},400);}
    if(!data||Object.keys(data).some(k=>!['projectId','action'].includes(k))||typeof data.projectId!=='string'||!data.projectId||data.projectId==='unassigned'||!['archive','restore'].includes(data.action??''))return reply({error:'Invalid project action'},400);
    const project=(await ctx.fns.projects.list({})).find(p=>p.id===data.projectId);
    if(!project)return reply({error:'Project not found'},404);
    await ctx.fns.projects.setArchived({projectId:project.id,archived:data.action==='archive'});
    return reply({ok:true,archived:data.action==='archive'});
}
