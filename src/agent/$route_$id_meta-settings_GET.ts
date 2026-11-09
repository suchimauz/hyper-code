/** Read owner-authorized native Meta settings without rendering HTML. */
export default async function(ctx:Context,_session:Session|null,opts:{/** Incoming HTTP request. */req:Request;/** Route agent identifier. */params:Record<string,string>}):Promise<Response>{
 return ctx.fns.agent.metaSurface({req:opts.req,id:opts.params.id!});
}
