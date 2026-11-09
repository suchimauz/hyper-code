/** Return owner-authorized telemetry data for native charts and inspection. */
export default async function(ctx:Context,_session:Session|null,opts:{/** Incoming query and identity. */ req:Request}):Promise<Response>{
const denied=await ctx.fns.telemetry.authorize({req:opts.req});if(denied)return denied;
const url=new URL(opts.req.url),hours=Math.max(1,Math.min(Number(url.searchParams.get('hours'))||24,8760)),limit=Math.max(1,Math.min(Number(url.searchParams.get('limit'))||10,100));
const [stats,storage,pg,csrfToken]=await Promise.all([ctx.fns.telemetry.stats({hours,limit}),ctx.fns.telemetry.storage({}),ctx.fns.telemetry.pgStats({limit}),ctx.fns.auth.csrfToken({req:opts.req})]);
return Response.json({stats,storage,pg,csrfToken},{headers:{'Cache-Control':'no-store'}});
}
