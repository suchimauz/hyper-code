/** Redirect navigation to native Gaps; return owner-authorized data for JSON clients. */
export default async function(ctx:Context,_session:Session|null,opts:{/** Browser navigation or JSON request. */req:Request}):Promise<Response>{
if(!opts.req.headers.get('Accept')?.includes('application/json'))return new Response(null,{status:302,headers:{Location:'/?view=extension:operations/gaps'}});
const denied=await ctx.fns.flow.authorize({req:opts.req});if(denied)return denied;
return Response.json({rows:await ctx.fns.flow.list({}),csrfToken:await ctx.fns.auth.csrfToken({req:opts.req})},{headers:{'Cache-Control':'no-store'}});
}
