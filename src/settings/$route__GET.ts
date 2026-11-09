/** Serve the native overview settings snapshot or browser navigation. */
export default async function (ctx: Context, _session: Session | null, opts: {
 /** Incoming owner settings request. */ req: Request;
 /** Captured route parameters. */ params: Record<string,string>;
}): Promise<Response> {
 if(!opts.req.headers.get('accept')?.includes('application/json')&&new URL(opts.req.url).searchParams.get('format')!=='json')return new Response(null,{status:302,headers:{Location:'/?view=extension:settings/overview'}});
 return ctx.fns.settings.browserApi({req:opts.req,section:'overview'});
}
