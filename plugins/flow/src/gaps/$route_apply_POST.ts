/** Apply one explicitly confirmed revision-bound target with owner and CSRF checks. */
export default async function(ctx:Context,_session:Session|null,opts:{/** Browser action request. */req:Request}):Promise<Response>{
const denied=await ctx.fns.flow.authorize({req:opts.req,write:true});if(denied)return denied;
const body=await opts.req.json().catch(()=>null);if(!body||body.confirm!==true||typeof body.flow!=='string'||typeof body.id!=='string'||typeof body.revision!=='string')return Response.json({error:'Confirmed target required'},{status:400});
try{const result=await ctx.fns.flow.reconcile({flow:body.flow,mode:'apply',target:{id:body.id,revision:body.revision}});await ctx.fns.flow.refreshCount({force:true});return Response.json({result},{headers:{'Cache-Control':'no-store'}});}catch(error){return Response.json({error:String(error instanceof Error?error.message:error)},{status:400});}
}
