/** Dedicated owner-authorized atomic batch cancel endpoint. */
export default async function(ctx:Context,_session:Session|null,opts:{req:Request;params:Record<string,string>}):Promise<Response>{return await ctx.fns.input.batchHttp({req:opts.req,params:opts.params,operation:"cancel"});}
