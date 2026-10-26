/**
 * Render agent identity and workspace controls in the chat toolbar.
 *
 * The avatar opens the icon picker, the name opens rename, and model selection
 * stays in the composer and agent menu. Registered badges and buttons retain
 * their layout order. The inspector reuses the live desktop rail/mobile dialog;
 * the native popover lazily loads fresh registered cards from /chat/:id/panel.
 * @param opts.context Agent and inherited conversation information to render.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Agent and inherited conversation information from chat.buildRenderContext. */
        context: types.chat.RenderContext;
    },
): Promise<string> {
    const esc = (v: unknown) => ctx.fns.procs.ui.escape({ text: v });
    const { agent } = opts.context;
    const id = String(agent.id);
    const [badges, buttons] = await Promise.all([
        ctx.fns.chat.renderParts({ kind: "badge", context: opts.context }),
        ctx.fns.chat.renderParts({ kind: "button", context: opts.context }),
    ]);
    const icon = ctx.fns.ui.popup({
        method: "chat.iconPopup",
        params: { agentId: id },
        html: `<span data-chat-avatar>${ctx.fns.chat.icon({ icon: agent.icon, model: agent.model, size: "md", live: true })}</span>`,
        attrs: 'class="chat-header-avatar" title="Изменить иконку агента" aria-label="Изменить иконку агента" data-chat-part="icon"',
    });
    const title = String(agent.title ?? "").slice(0, 60) || id;
    const name = ctx.fns.ui.popup({
        method: "chat.renamePopup",
        params: { agentId: id },
        html: `<span class="chat-header-title">${esc(title)}</span>`,
        attrs: `class="chat-header-name" title="Переименовать · ${esc(title)}" aria-label="Переименовать агента ${esc(title)}" data-chat-part="name"`,
    });
    const panel = await ctx.fns.ui.inplacePopup({
        id: `chat-panel-${id}`,
        triggerHtml: '<i class="ph ph-dots-three" aria-hidden="true"></i>',
        triggerAttrs: 'class="chat-toolbar-button chat-toolbar-more" title="Управление агентом" aria-label="Управление агентом" aria-expanded="false" data-chat-menu-trigger',
        panelAttrs: `role="dialog" aria-label="Управление агентом" data-chat-panel="/chat/${encodeURIComponent(id)}/panel"`,
        contentHtml: '<div data-chat-panel-body class="chat-panel-body" aria-live="polite"><p class="chat-panel-loading">Загрузка…</p></div>',
    });
    return `<header class="chat-header glass-bar" data-chat-header="${esc(id)}">
  ${icon}
  <div class="chat-header-identity">
    ${name}
    <div class="chat-header-meta"><span class="chat-agent-id" data-chat-technical-id title="ID агента: ${esc(id)}" aria-label="ID агента ${esc(id)}">${esc(id)}</span><div data-chat-badges class="chat-header-badges">${badges.join("")}</div></div>
  </div>
  <div class="chat-header-actions">
    <div data-chat-buttons>${buttons.join("")}</div>
    <button type="button" class="chat-toolbar-button" data-mobile-inspector-open aria-controls="agent-meta-${esc(id)}" aria-haspopup="dialog" aria-expanded="false" aria-pressed="false" aria-label="Открыть инспектор чата" title="Инспектор чата"><i class="ph ph-sidebar-simple" aria-hidden="true"></i><span class="chat-toolbar-label">Инспектор</span></button>
    ${panel}
  </div>
</header>`;
}
