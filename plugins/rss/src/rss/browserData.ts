/**
 * Serve RSS library data and explicitly confirmed feed management requests as JSON.
 *
 * Native React RSS page transport. Owner and cookie CSRF checks precede every operation; loads require explicit confirmation and are never triggered by GET.
 * @param opts.req GET catalogue or detail request, or JSON POST with an explicit add, load or load-all action.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** GET catalogue or detail request, or JSON POST with an explicit add, load or load-all action. */
        req: Request;
    },
): Promise<Response> {
    const denied = await ctx.fns.news.authorizeUi({req:opts.req}); if(denied)return denied;
    const headers={'Cache-Control':'no-store'};
    if(opts.req.method==='GET'){const key=new URL(opts.req.url).searchParams.get('key');return Response.json({feeds:await ctx.fns.rss.list({}),feed:key?await ctx.fns.rss.get({key}):null,csrfToken:await ctx.fns.auth.csrfToken({req:opts.req})},{headers});}
    if(opts.req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
    if(!opts.req.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'JSON required'},{status:415});
    const b=await opts.req.json() as {action?:string;confirmed?:boolean;key?:string;label?:string;url?:string;category?:string};
    if(b.confirmed!==true)return Response.json({error:'Explicit confirmation required'},{status:400});
    if(b.action==='add' && typeof b.key==='string' && typeof b.label==='string' && typeof b.url==='string')return Response.json({result:await ctx.fns.rss.add({key:b.key,label:b.label,url:b.url,category:b.category})},{headers});
    if(b.action==='load' && typeof b.key==='string')return Response.json({result:await ctx.fns.rss.load({key:b.key})},{headers});
    if(b.action==='load-all')return Response.json({result:await ctx.fns.rss.loadAll({})},{headers});
    return Response.json({error:'Invalid action'},{status:400});
}
