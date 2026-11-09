/**
 * Read a personal project icon or explicitly save its emoji, SVG or reset selection
 *
 * Serve the native workspace icon editor with owner authentication, visible-project authorization and cookie-bound CSRF. GET reads never materialize projects; POST delegates sanitization and personal membership writes to projects.setIcon.
 * @param opts.req GET with projectId or CSRF-protected JSON POST with projectId and exactly one emoji, svg or reset selection.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** GET with projectId or CSRF-protected JSON POST with projectId and exactly one emoji, svg or reset selection. */
        req: Request;
    },
): Promise<Response> {
    const headers={'Cache-Control':'no-store','Vary':'Cookie'};
    const reply=(body:object,status=200)=>Response.json(body,{status,headers});
    const user=(session as Session & {user?:{id:string;role?:string}})?.user;
    if(!user)return reply({error:'Unauthorized'},401);
    if(user.role!=='owner')return reply({error:'Owner access required'},403);
    const req=opts.req;
    if(!['GET','POST'].includes(req.method))return reply({error:'Method not allowed'},405);
    if(req.method==='GET'){
     const projectId=new URL(req.url).searchParams.get('projectId')||'';
     const project=await ctx.fns.projects.get({projectId});
     if(!project||project.virtual)return reply({error:'Project not found'},404);
     return reply({icon:project.icon||null,csrfToken:await ctx.fns.auth.csrfToken({req})});
    }
    if(!await ctx.fns.auth.verifyCsrf({req,token:req.headers.get('x-csrf-token')||''}))return reply({error:'Invalid request token'},403);
    if(req.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')return reply({error:'JSON body required'},415);
    const raw=await req.text();if(raw.length>65536)return reply({error:'Request too large'},413);
    let data:Record<string,unknown>;try{data=JSON.parse(raw);}catch{return reply({error:'Invalid JSON'},400);}
    if(!data||Array.isArray(data)||typeof data!=='object'||Object.keys(data).some(k=>!['projectId','emoji','svg','background','reset'].includes(k))||typeof data.projectId!=='string'||!data.projectId||['emoji','svg','background'].some(k=>data[k]!==undefined&&typeof data[k]!=='string')||(data.reset!==undefined&&data.reset!==true)||[!!data.emoji,!!data.svg,data.reset===true].filter(Boolean).length!==1)return reply({error:'Invalid icon selection'},400);
    const project=await ctx.fns.projects.get({projectId:data.projectId});
    if(!project||project.virtual)return reply({error:'Project not found'},404);
    try{
     const result=await ctx.fns.projects.setIcon({projectId:project.id,emoji:data.emoji as string|undefined,svg:data.svg as string|undefined,background:data.background as string|undefined,reset:data.reset as boolean|undefined});
     return reply({ok:true,icon:result.icon});
    }catch(cause){return reply({error:cause instanceof Error?cause.message:'Cannot save icon'},400);}
}
