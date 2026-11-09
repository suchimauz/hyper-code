/** Accept explicitly confirmed native JSON sharing with URL-shaped News identifiers. */
export default async function(ctx:Context,_session:Session|null,opts:{/** Owner browser request with cookie CSRF. */req:Request;/** Route parameters. */params:Record<string,string>}):Promise<Response>{
 const denied=await ctx.fns.news.authorizeUi({req:opts.req});if(denied)return denied;
 if(!opts.req.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'JSON required'},{status:415});
 const body=await opts.req.json() as {id?:string;target?:string;destination?:string;text?:string;confirmed?:boolean};
 if(!body.id||!body.target||!body.destination||body.confirmed!==true)return Response.json({error:'Explicit item, target, destination and confirmation required'},{status:400});
 return Response.json(await ctx.fns.news.share({id:body.id,target:body.target,destination:body.destination,text:body.text,confirm:true}));
}
