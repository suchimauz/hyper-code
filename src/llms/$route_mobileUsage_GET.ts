/** Return read-only account quota and catalogue data for the mobile overview, using the desktop data source. */
export default async function (ctx: Context, _session: Session | null, _opts: {
    /** Incoming authenticated UI request; authentication is enforced by the application middleware. */
    req: Request;
}): Promise<Response> {
    const { entries, gateway } = await ctx.fns.llms.usageData({ includeConnected: true });
    return Response.json({
        entries: entries.map(entry => ({ ...entry, logoHtml: ctx.fns.ui.modelLogo({ model: entry.model, bare: true, compact: true }) })),
        gateway: gateway ? { ...gateway, logoHtml: ctx.fns.ui.modelLogo({ model: 'oneapi:', bare: true, compact: true }) } : null,
    }, { headers: { 'cache-control': 'no-store' } });
}
