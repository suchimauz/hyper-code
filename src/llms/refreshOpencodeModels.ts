/**
 * Refresh the OpenCode model catalogue from the Connections UI
 *
 * Use from the OpenCode Console account action to force authenticated model and public metadata discovery. Returns only a model count and no credentials, quota estimates or generation claims.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<string> {
    const models = await ctx.fns.llm.opencodeModels({ refresh: true });
    if (ctx.state.llmModelCatalog) {
    ctx.state.llmModelCatalog.all = undefined;
    ctx.state.llmModelCatalog.skipNodes = undefined;
}
return `<p role="status">OpenCode catalogue refreshed: ${models.length} callable models. The Connections list updates automatically.</p>`;
}
