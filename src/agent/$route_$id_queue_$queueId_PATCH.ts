/** Authenticated durable next-turn queue endpoint. */
export default async function(ctx: Context, session: Session | null, opts: { req: Request; params: Record<string,string> }): Promise<Response> {
 return await ctx.fns.agent.queueRequest({req:opts.req,params:{...opts.params}});
}
