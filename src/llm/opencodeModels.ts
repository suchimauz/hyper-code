/**
 * List callable OpenCode model IDs from the authenticated enriched catalogue
 *
 * Return tool-capable model IDs routed by the official plan-specific endpoint table. Includes documented public pay-as-you-go chat models without credentials. Use refresh after credential changes or manual model refresh.
 * @param opts.refresh Force authenticated and public metadata rediscovery. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Force authenticated and public metadata rediscovery. @default false */
        refresh?: boolean;
    },
): Promise<string[]> {
    try {
        const catalog = await ctx.fns.llm.opencodeCatalog({refresh:opts.refresh});
        return catalog.models.filter(model => model.toolCall).map(model => model.id);
    } catch (error) {
        if (opts.refresh) throw error;
        await ctx.fns.procs.log.warn({event:'llm.opencode.catalogue',msg:'OpenCode catalogue unavailable'});
        return [];
    }
}
