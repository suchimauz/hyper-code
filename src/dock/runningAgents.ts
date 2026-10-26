/**
 * Render live navigation chats with project names, execution states and working-descendant counts.
 *
 * Use in the sidebar to show every unarchived navigation-visible chat running itself or with working descendants. Reads agent rows without changing their own execution state and renders native icons and links in a live region.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<string> {
    const teamActivity = await ctx.fns.agent.teamActivity({});
    const projects = new Map((await ctx.fns.projects.list({})).map(project => [project.id, project]));
    const rows = await ctx.fns.procs.db.select({
     sql: "SELECT id, COALESCE(NULLIF(title, ''), id) AS title, model, icon, workspace_dir, workspace_host, run_state FROM agents WHERE archived_at IS NULL AND visibility = 'nav' ORDER BY run_started_at ASC NULLS LAST, id ASC",
     params: [],
    });
    const esc = (text: string) => ctx.fns.procs.ui.escape({text});
    const active = rows.filter(row => (!!row.run_state?.trim() && row.run_state !== 'idle') || (teamActivity[row.id]??0)>0);
    const links = (await Promise.all(active.map(async (row: { id: string; title: string; model: string | null; icon: string | null; run_state: string | null; workspace_dir?: string | null; workspace_host?: string | null }) => {
        const workspace = row.workspace_dir?.startsWith('/')
            ? await ctx.fns.projects.identity({dir: row.workspace_dir, host: row.workspace_host ?? ''}) : null;
        const project = workspace ? projects.get(workspace.id) : undefined;
        const projectName = workspace ? (project?.title || workspace.dir.split('/').filter(Boolean).pop() || '/') : 'Без проекта';
        const projectLabel = projectName + (workspace?.host ? ' · ' + workspace.host : '');
        const count = teamActivity[row.id] ?? 0;
        const ownState = row.run_state?.trim() || 'idle';
        const stateLabel = ({running: 'Работает', idle: 'Ожидает', queued: 'В очереди'} as Record<string,string>)[ownState] ?? ownState;
        const status = stateLabel + (count > 0 ? ' · Подагенты: ' + count : '');
        const label = row.title + ' — ' + projectLabel + (workspace ? ' (' + workspace.dir + ')' : '') + ' — ' + status;
        return ctx.fns.procs.ui.button({
            href: '/agent/' + encodeURIComponent(row.id), get: '/agent/' + encodeURIComponent(row.id), target: '#main',
            html: ctx.fns.chat.icon({ icon: row.icon, model: row.model, active: true, size: 'sm' }) + '<span class="dock-running-copy"><span class="dock-running-title">' + esc(row.title) + '</span><span class="dock-running-project">' + esc(projectLabel) + '</span><span class="dock-running-status">' + esc(status) + '</span></span>',
            title: label, ariaLabel: label,
            appearance: 'plain', class: 'dock-running-row', attrs: { 'data-running-agent': row.id, 'hx-push-url': 'true' },
        });
    }))).join('');
    return ctx.fns.ui.live({ id: 'dock-running-agents', url: '/dock/running', topic: 'agents', every: 5,
     attrs: 'aria-label="Running chats"',
     html: '<div class="dock-running-heading"><span>Сейчас работают</span><span>' + active.length + '</span></div><div class="dock-running-list">' + (links || '<span class="dock-running-empty text-xs text-subtle">Нет работающих чатов</span>') + '</div>',
    });
}
