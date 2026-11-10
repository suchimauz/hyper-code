/** Read an owned Git Canvas tab through the fixed inspection API. */
export default async function(ctx:Context,_session:Session|null,opts:{req:Request}):Promise<Response>{return ctx.fns.gitUi.handle({req:opts.req});}
