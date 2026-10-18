/**
 * Render the horizontal live strip of currently running navigation chats.
 *
 * Use in the sidebar to show every unarchived navigation-visible chat with a nonempty, non-idle run state. Reads agent rows without modifying chats and renders native icons and links in a live region.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<string> {
    const rows = await ctx.fns.procs.db.select({
     sql: "SELECT id, COALESCE(NULLIF(title, ''), id) AS title, model, icon FROM agents WHERE archived_at IS NULL AND visibility = 'nav' AND NULLIF(TRIM(run_state), '') IS NOT NULL AND run_state <> 'idle' ORDER BY run_started_at ASC NULLS LAST, id ASC",
     params: [],
    });
    const links = rows.map((row: { id: string; title: string; model: string | null; icon: string | null }) => ctx.fns.procs.ui.button({
     href: '/agent/' + encodeURIComponent(row.id), get: '/agent/' + encodeURIComponent(row.id), target: '#main',
     html: ctx.fns.chat.icon({ icon: row.icon, model: row.model, active: true, size: 'sm' }),
     title: row.title + ' — running', ariaLabel: row.title + ' — running',
     appearance: 'plain', class: 'shrink-0', attrs: { 'data-running-agent': row.id, 'hx-push-url': 'true' },
    })).join('');
    return ctx.fns.ui.live({ id: 'dock-running-agents', url: '/dock/running', topic: 'agents', every: 5,
     attrs: 'aria-label="Running chats"',
     html: '<div class="dock-running-list">' + (links || '<span class="text-xs text-subtle whitespace-nowrap">No running chats</span>') + '</div>',
    });
}
