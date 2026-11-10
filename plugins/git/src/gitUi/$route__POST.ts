/** Open a Git Canvas tab for the authorized agent workspace after CSRF verification. */
export default async function(ctx:Context,_session:Session|null,opts:{req:Request}):Promise<Response>{return ctx.fns.gitUi.handle({req:opts.req});}
