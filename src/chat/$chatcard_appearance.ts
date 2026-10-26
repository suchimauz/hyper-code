// Panel card: chat appearance — icon, name and model. Reasoning effort lives in the composer.
export default {
    title: "Настройки",
    icon: "ph-palette",
    order: 10,
    render(_ctx: Context, _session: Session | null, view: types.chat.RenderContext): types.chat.CardRow[] {
        const a = view.agent;
        const agentId = a.id;
        return [
            { icon: "ph-cpu", label: "Модель", hint: String(a.model).split(":").pop(), popup: { method: "agent.modelPicker", params: { agentId } } },
        ];
    },
} satisfies types.chat.Card;
