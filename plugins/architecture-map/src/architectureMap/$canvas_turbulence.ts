export const hint = "live churn-versus-complexity map for MauzCode source files — args `{ root?: string }`";
export default {
  icon: "chart-scatter",
  live: true,
  prepare(_ctx: Context, opts: { agentId: string; args: Record<string, any> }) { return { args: opts.args.root ? { root: String(opts.args.root) } : {}, title: "MauzCode Turbulence" }; },
    render() { return '<p>This visualization is available in the native MauzCode Canvas.</p>'; },
  describe(_ctx: Context, opts: { item: types.canvas.Item }) { return `live turbulence map${opts.item.args.root ? ` for ${opts.item.args.root}` : " for all MauzCode source roots"}`; },
} satisfies types.canvas.Kind;
