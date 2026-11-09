/** Accept confirmed native RSS management JSON; authorize owner and CSRF before any operation. */
export default async function(ctx:Context,_session:Session|null,opts:{/** Browser JSON request. */req:Request;/** Legacy route parameters. */params:Record<string,string>}):Promise<Response>{return ctx.fns.rss.browserData({req:opts.req});}
