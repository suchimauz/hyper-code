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
    // Shared toggles submit "1"; this endpoint deliberately accepts only "true".
    const inputToggle = ctx.fns.ui.toggle({name:'input',enabled:prefs.input,label:'Action required',compact:true}).replace('value="1"', 'value="true"');
    const errorToggle = ctx.fns.ui.toggle({name:'error',enabled:prefs.error,label:'Work stopped by error',compact:true}).replace('value="1"', 'value="true"');
    const save = ctx.fns.procs.ui.button({action:'save-push-preferences',label:'Save',ariaLabel:'Save notification preferences',type:'submit',size:'xs',tone:'default'});
    return `<form hx-post="/webPush/preferences" hx-target="this" hx-swap="outerHTML" class="mt-3 space-y-2">
        <input type="hidden" name="agentId" value="${esc(opts.agentId)}"><input type="hidden" name="csrf" value="${esc(csrf)}">
        <fieldset class="inspector-group inspector-surface-group">
            <legend class="inspector-label">Push Notifications</legend>
            ${inputToggle}${errorToggle}
        </fieldset>
        <div class="flex items-center justify-between gap-2"><span class="inspector-help">Requires device notifications.</span>${save}</div>
    </form>`;
}
