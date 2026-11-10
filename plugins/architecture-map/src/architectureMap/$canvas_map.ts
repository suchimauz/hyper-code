export const hint = "MauzCode's live module dependency map with core/plugin filters, cycle and ownership-boundary highlighting — args `{ scope?: \"all\"|\"core\"|\"plugins\", minWeight?: number }`";

export default {
    icon: "graph",
    live: true,
    prepare(_ctx: Context, opts: { agentId: string; args: Record<string, any> }) {
        const scope = ["all", "core", "plugins"].includes(String(opts.args.scope)) ? String(opts.args.scope) : "all";
        const minWeight = Math.max(1, Math.min(50, Number(opts.args.minWeight) || 2));
        return { args: { scope, minWeight }, title: "MauzCode Architecture Map" };
    },
    render() { return '<p>This visualization is available in the native MauzCode Canvas.</p>'; },
    describe(_ctx: Context, opts: { item: types.canvas.Item }) {
        const state = { ...opts.item.args, ...opts.item.state };
        return `live MauzCode architecture map — scope ${state.scope ?? "all"}, minimum edge weight ${state.minWeight ?? 2}`;
    },
} satisfies types.canvas.Kind;
