/** Return owner-only declared plugin configuration without credential values.
 * @param opts.req Incoming configuration read request.
 * @param opts.params Mounted plugin route parameters.
 */
export default async function(ctx: Context, session: Session | null, opts: {
 /** Incoming configuration read request. */ req: Request;
 /** Mounted plugin route parameters. */ params: Record<string,string>;
}): Promise<Response> {
    const who = await ctx.fns.auth.currentUser({req:opts.req});
    const { user } = who;
 const headers={'Cache-Control':'no-store','Vary':'Cookie'};
 if (who.required && !user && !who.legacy)return Response.json({error:'Unauthorized'},{status:401,headers});
 if (user && user.role !== 'owner')return Response.json({error:'Owner access required'},{status:403,headers});
 try {return Response.json({configuration:await ctx.fns.plugins.configuration({name:opts.params.name!}),csrfToken:await ctx.fns.auth.csrfToken({req:opts.req})},{headers});}
 catch{return Response.json({error:'Configuration unavailable'},{status:400,headers});}
}
