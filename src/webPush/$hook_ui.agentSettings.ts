/** Contribute owner-only Push Notifications controls to the agent inspector.
 * @param opts.agentId Agent whose settings section is being rendered.
 */
export default async function(ctx: Context, _session: Session | null, opts: {
    /** Agent whose settings section is being rendered. */
    agentId: string;
}): Promise<string> {
    return await ctx.fns.webPush.settingsHtml({agentId: opts.agentId});
}
