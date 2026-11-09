export const hint = "live churn-versus-complexity map for Hyper source files — args `{ root?: string }`";
export default {
  icon: "chart-scatter",
  live: true,
  prepare(_ctx: Context, opts: { agentId: string; args: Record<string, any> }) { return { args: opts.args.root ? { root: String(opts.args.root) } : {}, title: "Hyper Turbulence" }; },
    render() { return '<p>This visualization is available in the native Hyper Canvas.</p>'; },
  describe(_ctx: Context, opts: { item: types.canvas.Item }) { return `live turbulence map${opts.item.args.root ? ` for ${opts.item.args.root}` : " for all Hyper source roots"}`; },
} satisfies types.canvas.Kind;
