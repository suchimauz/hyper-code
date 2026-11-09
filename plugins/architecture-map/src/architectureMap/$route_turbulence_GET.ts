/** Read cached churn and complexity for the native turbulence view; validate Canvas ownership when an item is supplied. */
export default async function(ctx: Context, _session: Session | null, opts: { /** Incoming authenticated browser request. */ req: Request; /** HTTP route parameters. */ params: Record<string,string> }): Promise<Response> {
  const url = new URL(opts.req.url);
  if (url.searchParams.has('itemId') || url.searchParams.has('agentId')) {
    const agentId = url.searchParams.get('agentId') ?? '';
    const denied = await ctx.fns.canvas.authorizeHttp({ req: opts.req, agentId });
    if (denied) return denied;
    const itemId = Number(url.searchParams.get('itemId'));
    if (!(await ctx.fns.canvas.list({ agentId })).some(item => item.id === itemId && item.kind === 'architectureMap.turbulence')) return new Response('No such canvas item', { status: 404 });
  }
  if (!opts.req.headers.get('accept')?.includes('application/json')) return new Response(null, {status:302,headers:{Location:'/?view=extension:visualizations/turbulence'}});
  return Response.json(await ctx.fns.architectureMap.turbulence({root:url.searchParams.get('root') || undefined,limit:3000}));
}
