/** Run owner-authorized explicitly confirmed maintenance after cookie-bound CSRF validation. */
export default async function(ctx:Context,_session:Session|null,opts:{/** Browser write request. */req:Request}):Promise<Response>{
const denied=await ctx.fns.telemetry.authorize({req:opts.req,write:true});if(denied)return denied;
const body=await opts.req.json().catch(()=>null);if(body?.confirm!=='compact-and-prune')return Response.json({error:'Explicit maintenance confirmation required'},{status:400});
const result=await ctx.fns.telemetry.maintain({force:true});return Response.json({result},{headers:{'Cache-Control':'no-store'}});
}
