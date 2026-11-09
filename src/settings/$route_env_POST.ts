/** Serve the native overview settings JSON mutation contract. */
export default async function (ctx: Context, _session: Session | null, opts: {
 /** Incoming owner settings request. */ req: Request;
 /** Captured route parameters. */ params: Record<string,string>;
}): Promise<Response> {
 return ctx.fns.settings.browserApi({req:opts.req,section:'overview'});
}
