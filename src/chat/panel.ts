/**
 * Render the agent management popover with editable identity and registered actions.
 *
 * Keeps plugin ordering/visibility, isolated 1.5-second card rendering and the
 * mandatory danger card. Context, work and automation use disclosures to keep
 * everyday controls visible without removing their live information. Served
 * lazily by GET /chat/:id/panel; all mutations use existing popups and POST forms.
 * @param opts.agentId Agent whose management controls should be rendered.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Identifier of the agent whose current settings and actions are shown. */
        agentId: string;
    },
): Promise<string> {
    const esc = (v: unknown) => ctx.fns.procs.ui.escape({ text: v });
    const view = await ctx.fns.chat.buildRenderContext({ agentId: opts.agentId });
    if (!view) return `<p class="chat-panel-loading">Агент ${esc(opts.agentId)} не найден</p>`;
    const cards = await ctx.fns.chat.listParts({ kind: "card" });
    const drawn = await Promise.all(cards.map(async part => {
        const card = part as types.chat.Card & types.chat.RegisteredPart;
        const out = await ctx.fns.chat.withTimeout({ id: card.id, run: () => card.render(ctx, session, view) }) as Awaited<ReturnType<types.chat.Card["render"]>>;
        if (!out) return "";
        const rows: types.chat.CardRow[] = Array.isArray(out) ? out : typeof out === "object" ? out.rows ?? [] : [];
        const html = typeof out === "string" ? out : !Array.isArray(out) && typeof out === "object" ? String(out.html ?? "") : "";
        if (!rows.length && !html) return "";
        const icon = card.icon ? `<i class="ph ${esc(card.icon)}" aria-hidden="true"></i>` : "";
        const content = `${html}${rows.length ? `<div class="chat-card-rows">${ctx.fns.chat.renderCardRows({ rows })}</div>` : ""}`;
        const disclosure = ["agent.context", "agent.work", "agent.wakeups"].includes(card.id);
        return disclosure
            ? `<details class="chat-card chat-card-disclosure" data-chat-id="${esc(card.id)}"><summary>${icon}<span>${esc(card.title)}</span><i class="ph ph-caret-right chat-card-chevron" aria-hidden="true"></i></summary><div class="chat-card-detail">${content}</div></details>`
            : `<section class="chat-card${card.id === "danger" ? " chat-card-danger" : ""}" data-chat-id="${esc(card.id)}"><h3 class="chat-card-heading">${esc(card.title)}</h3>${content}</section>`;
    }));
    const a = view.agent;
    const agentId = String(a.id);
    const title = String(a.title || a.id);
    const icon = ctx.fns.ui.popup({
        method: "chat.iconPopup", params: { agentId },
        html: `${ctx.fns.chat.icon({ icon: a.icon, model: a.model, size: "lg" })}<span class="chat-panel-icon-edit"><i class="ph ph-pencil-simple" aria-hidden="true"></i></span>`,
        attrs: 'class="chat-panel-avatar" title="Изменить иконку агента" aria-label="Изменить иконку агента"',
    });
    const name = ctx.fns.ui.popup({
        method: "chat.renamePopup", params: { agentId }, html: esc(title),
        attrs: 'class="chat-panel-name" title="Переименовать агента" aria-label="Переименовать агента"',
    });
    const dir = String(a.workspaceDir ?? "").replace(/\/+$/, "");
    const workspace = dir.split("/").pop() || dir;
    return `<div class="chat-panel-title"><span>Управление агентом</span><button type="button" data-chat-panel-close aria-label="Закрыть меню" title="Закрыть меню"><i class="ph ph-x" aria-hidden="true"></i></button></div>
<div class="chat-panel-identity">${icon}<div class="chat-panel-identity-text">${name}<p class="chat-panel-meta"><span class="chat-agent-id" data-chat-technical-id title="ID агента: ${esc(agentId)}" aria-label="ID агента ${esc(agentId)}"><span class="chat-agent-id-label">ID</span> ${esc(agentId)}</span>${workspace ? `<span class="chat-panel-project" title="${esc(dir)}">${esc(workspace)}</span>` : ""}</p><p class="chat-panel-tip">Нажмите на имя или иконку, чтобы изменить</p></div></div>
<section class="chat-card chat-panel-workspace"><h3 class="chat-card-heading">Рабочее пространство</h3><div class="chat-panel-shortcuts">
<button type="button" class="chat-panel-shortcut" data-canvas-toggle="open" aria-pressed="false"><i class="ph ph-square-half" aria-hidden="true"></i><span>Canvas<small>Файлы и документы</small></span></button>
<button type="button" class="chat-panel-shortcut" data-mobile-inspector-open aria-controls="agent-meta-${esc(agentId)}" aria-haspopup="dialog" aria-expanded="false" aria-pressed="false"><i class="ph ph-sidebar-simple" aria-hidden="true"></i><span>Инспектор<small>План, команда, детали</small></span></button>
</div><button type="button" class="chat-row chat-search-open" data-chat-search="${esc(agentId)}"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><span>Поиск по переписке</span></button></section>
<div class="chat-panel-cards">${drawn.filter(Boolean).join("")}</div>`;
}
