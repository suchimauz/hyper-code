/** Serve the guarded persistent goal snapshot for native mobile clients. */
export default async function(ctx:Context,_session:Session|null,opts:{req:Request;params:Record<string,string>}):Promise<Response>{
 return await ctx.fns.goal.surfaceRead({req:opts.req,agentId:opts.params.id!});
}
