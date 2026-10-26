/**
 * Render the project sidebar with menu, search, new-chat and collapse controls,
 * readable running chats, always-visible quotas, utilities and the signed-in person.
 * Quotas remain fixed even when an older personal layout hid the quota shortcut.
 *
 * Every `$dock_` entry is drawn in parallel with its own timeout; an entry that throws, times out or
 * returns nothing is simply left out, so one plugin cannot break or stall the page shell. Each entry is
 * wrapped in an element carrying `data-dock-id` for ordering and automation.
 * @param opts.timeoutMs Per-entry render budget in milliseconds. @default 1500 @minimum 50 @maximum 10000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Per-entry render budget in milliseconds. @default 1500 @minimum 50 @maximum 10000 */
        timeoutMs?: number;
    },
): Promise<string> {
    const esc = (v: unknown) => ctx.fns.procs.ui.escape({ text: v });
    const budget = Math.max(50, Math.min(10_000, opts.timeoutMs ?? 1500));
    const { top, bottom, hidden } = await ctx.fns.dock.items({});
    const labels = Object.fromEntries([...top, ...bottom, ...hidden].map(x => [x.id, x.label ?? x.id]));
    const draw = async (item: types.dock.Registered, fixed = false): Promise<string> => {
        try {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const out = await Promise.race([
                Promise.resolve(item.render ? item.render(ctx, session) : { icon: item.icon ?? "ph-circle", label: item.label ?? item.id, href: item.href }),
                new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${budget}ms`)), budget); }),
            ]).finally(() => clearTimeout(timer));
            if (!out) return "";
            const html = typeof out === "string" ? out : await ctx.fns.dock.drawButton({ id: item.id, button: out });
            return html ? `<div class="${fixed ? 'dock-fixed' : 'dock-item'} flex w-full flex-col items-center" data-dock-id="${esc(item.id)}"${item.pinned ? ` data-dock-pinned="${item.pinned}"` : ""}>${html}</div>` : "";
        } catch (error: any) {
            ctx.fns.procs.log.warn({ event: "dock.render.failed", msg: `${item.id}: ${String(error?.message ?? error)}` });
            return "";
        }
    };
    // Header controls keep their native renderers; pinned chats stay in the menu,
    // while this shell shows currently running chats instead.
    const headerIds = new Set(['theme', 'update.update']);
    const headerItems = [...top, ...bottom, ...hidden].filter(item => headerIds.has(item.id));
    const quotaItem = [...top, ...bottom, ...hidden].find(item => item.id === 'llms.quota');
    const ordinary = (item: types.dock.Registered) => !headerIds.has(item.id) && item.id !== 'llms.quota' && item.pinned !== 'agent';
    const [bottomHtml, headerHtml, running, me, quota] = await Promise.all([
        Promise.all(bottom.filter(ordinary).map(item => draw(item))),
        Promise.all(headerItems.map(item => draw(item, true))),
        ctx.fns.dock.runningAgents({}),
        ctx.fns.auth.meBadge({}).catch(() => ""),
        quotaItem ? draw(quotaItem, true) : Promise.resolve(''),
    ]);
    const pageAgent = /^\/agent\/([^/]+)$/.exec(session?.url?.pathname ?? '')?.[1];
    const navigation = session?.req ? await ctx.fns.projects.navigation({agentId:pageAgent,projectId:session.url?.searchParams.get('projectId') || undefined}) : {sidebar:'<div class="project-heading">PROJECTS</div>',tabs:''};
    const menu = ctx.fns.procs.ui.button({ action: "open-global-menu", html: '<span class="dock-brand-mark" aria-hidden="true">H</span><span class="dock-brand-name">Hyper</span>', appearance: "plain", title: "Global menu — ⌘/", ariaLabel: "Open global menu", class: "dock-brand", attrs: { onclick: "window.__navOpen?.()" } });
    const collapse = ctx.fns.procs.ui.button({ action: 'toggle-sidebar', html: '<i class="ph ph-sidebar-simple" aria-hidden="true"></i>', appearance: 'plain', ariaLabel: 'Свернуть панель', title: 'Свернуть панель', class: 'project-icon-button', attrs: { 'aria-expanded': 'true', 'aria-controls': 'project-sidebar' } });
    const search = ctx.fns.procs.ui.button({ action: 'sidebar-search', html: '<i class="ph ph-magnifying-glass" aria-hidden="true"></i><span class="dock-action-label">Поиск в меню</span><kbd>⌘/</kbd>', appearance: 'plain', ariaLabel: 'Поиск в меню', title: 'Поиск в меню — ⌘/', class: 'dock-search', attrs: { onclick: 'window.__navOpen?.()' } });
    const newChat = ctx.fns.ui.popup({ method: 'ui.newAgentPopup', params: {}, html: '<i class="ph ph-plus" aria-hidden="true"></i>', attrs: 'class="dock-new-chat" title="Новый чат" aria-label="Новый чат"' });
    return `<nav id="dock" aria-label="Dock" data-dock-hidden="${esc(JSON.stringify(hidden.filter(ordinary).map(x => x.id)))}" data-dock-labels="${esc(JSON.stringify(labels))}" class="flex h-full shrink-0 flex-col border-r border-ui-border bg-base-200">
    <div class="project-shell-header"><div class="dock-fixed" data-dock-id="menu">${menu}</div>${collapse}</div>
    <div class="dock-primary-actions">${search}${newChat}</div>
    <div class="dock-navigation-scroll"><div id="project-sidebar" class="project-sidebar" data-live-topic="projects">${navigation.sidebar}</div><span hidden data-live-topic="agents"></span>${running}</div>
    <div class="dock-footer"><div id="dock-limits-home">${quota ? `<section id="dock-limits" aria-label="Лимиты моделей"><a class="dock-limits-heading" href="/llms" hx-get="/llms" hx-target="#main" hx-push-url="true"><span>Модели и лимиты</span><i class="ph ph-caret-right" aria-hidden="true"></i></a>${quota}</section>` : ''}</div>
    <div class="dock-account-row">${me ? `<div class="dock-fixed dock-account" data-dock-id="me">${me}</div>` : ""}<div class="dock-utilities"><div id="dock-bottom" class="dock-zone flex w-full flex-col items-center gap-1" data-dock-zone="bottom">${bottomHtml.join("")}</div><div class="project-header-controls">${headerHtml.join("")}</div></div></div></div>
    <script src="/dock/dock.js" defer></script>
  </nav>`;
}
