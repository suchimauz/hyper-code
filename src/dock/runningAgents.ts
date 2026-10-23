/**
 * Render the horizontal live strip of currently running navigation chats.
 *
 * Use in the sidebar to show every unarchived navigation-visible chat running itself or with working descendants. Reads agent rows without changing their own execution state and renders native icons and links in a live region.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<string> {
    const teamActivity = await ctx.fns.agent.teamActivity({});
    const rows = await ctx.fns.procs.db.select({
     sql: "SELECT id, COALESCE(NULLIF(title, ''), id) AS title, model, icon, run_state FROM agents WHERE archived_at IS NULL AND visibility = 'nav' ORDER BY run_started_at ASC NULLS LAST, id ASC",
     params: [],
    });
    const links = rows.filter(row => (!!row.run_state?.trim() && row.run_state !== 'idle') || (teamActivity[row.id]??0)>0).map((row: { id: string; title: string; model: string | null; icon: string | null }) => ctx.fns.procs.ui.button({
     href: '/agent/' + encodeURIComponent(row.id), get: '/agent/' + encodeURIComponent(row.id), target: '#main',
     html: ctx.fns.chat.icon({ icon: row.icon, model: row.model, active: true, size: 'sm' }),
     title: row.title + ((teamActivity[row.id]??0)>0 ? ' — Working subagents: '+teamActivity[row.id] : ' — running'), ariaLabel: row.title + ((teamActivity[row.id]??0)>0 ? ' — Working subagents: '+teamActivity[row.id] : ' — running'),
     appearance: 'plain', class: 'shrink-0', attrs: { 'data-running-agent': row.id, 'hx-push-url': 'true' },
    })).join('');
    return ctx.fns.ui.live({ id: 'dock-running-agents', url: '/dock/running', topic: 'agents', every: 5,
     attrs: 'aria-label="Running chats"',
     html: '<div class="dock-running-list">' + (links || '<span class="text-xs text-subtle whitespace-nowrap">No running chats</span>') + '</div>',
    });
}
