/** Handle POST /webPush/unsubscribe for authenticated browser push opt-in. */
export default async function(ctx:Context,_session:Session|null,opts:{/** Incoming HTTP request. */req:Request;/** Route parameters. */params:Record<string,string>}):Promise<Response>{
 return await ctx.fns.webPush.handle({req:opts.req,action:'unsubscribe'});
}
