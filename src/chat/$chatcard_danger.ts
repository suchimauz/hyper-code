// Panel card: Archive and Delete. Owned by the core: always last, cannot be hidden by chat.layout.
export default {
    title: "Хранение и удаление",
    icon: "ph-warning",
    order: 1000,
    render(_ctx: Context, _session: Session | null, view: types.chat.RenderContext): types.chat.CardRow[] {
        const id = encodeURIComponent(view.agent.id);
        return [
            { icon: "ph-archive", label: "В архив", hint: "история сохранится", post: `/agent/${id}/archive` },
            { icon: "ph-trash", label: "Удалить агента…", post: `/agent/${id}/delete`, confirm: `Удалить агента ${view.agent.id}? Его история тоже будет удалена.`, tone: "danger" },
        ];
    },
} satisfies types.chat.Card;
