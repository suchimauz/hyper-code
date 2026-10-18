/**
 * Render owner-only main-agent Push Notifications inspector controls
 *
 * Answers the agent inspector extension with two independent default-on push preferences. Returns empty HTML for viewers other than the active owner and for child or hidden agents. Uses a self-contained CSRF-protected HTMX form.
 * @param opts.agentId Agent whose owner controls should be rendered.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent whose owner controls should be rendered. */
        agentId: string;
    },
): Promise<string> {
    const owner = session?.user?.id;
    if (!owner || !session?.req) return '';
    const rows = await ctx.fns.procs.db.select({sql:'SELECT a.id FROM agents a JOIN users u ON u.id=a.created_by WHERE a.id=? AND a.created_by=? AND u.disabled_at IS NULL',params:[opts.agentId,owner]});
    if (!rows.length) return '';
    const prefs = await ctx.fns.webPush.preferences({agentId:opts.agentId});
    if (!prefs.eligible) return '';
    const csrf = await ctx.fns.auth.csrfToken({req:session.req});
    const esc = Bun.escapeHTML;
    return '<form hx-post="/webPush/preferences" hx-target="this" hx-swap="outerHTML" class="mt-3 space-y-2"><h4 class="text-sm font-medium">Push Notifications</h4><input type="hidden" name="agentId" value="'+esc(opts.agentId)+'"><input type="hidden" name="csrf" value="'+esc(csrf)+'"><label class="flex items-center gap-2 text-sm"><input type="checkbox" name="input" value="true"'+(prefs.input?' checked':'')+'>Action required (input)</label><label class="flex items-center gap-2 text-sm"><input type="checkbox" name="error" value="true"'+(prefs.error?' checked':'')+'>Work stopped by error</label><p class="text-xs opacity-70">Requires push notifications enabled on this device.</p><button type="submit" class="text-sm underline">Save notification preferences</button></form>';
}
