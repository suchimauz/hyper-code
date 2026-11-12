/** Serve the owner-only saved SOCKS5 proxy registry JSON contract. */
export default async function(ctx: Context, _session: Session | null, opts: {
 /** Incoming settings request. */ req: Request;
 /** Captured route parameters. */ params: Record<string,string>;
}): Promise<Response> { return ctx.fns.socksProxy.browserApi({req:opts.req}); }
