// File tabs use the native React CanvasFile surface. This kind only pins paths and describes items.

export const hint = "a file or directory from the workspace (or an SSH host) in the full Files viewer — args `{ path, host?, mode?: \"auto\"|\"preview\"|\"source\" }`";

export default {
    icon: "file-text",
    live: true,
    async prepare(ctx: Context, opts: { agentId: string; args: Record<string, any> }) {
        const path = String(opts.args.path ?? "").trim();
        if (!path) throw new Error("canvas file: args.path is required");
        const mode = ["preview", "source"].includes(opts.args.mode) ? opts.args.mode : "auto";
        const tab = ["preview", "code", "edit"].includes(opts.args.tab) ? opts.args.tab : mode === "preview" ? "preview" : mode === "source" ? "code" : "";
        // Resolve against the TARGET agent's workspace (not the caller's), and pin the result: an absolute
        // path plus an explicit host ("local" or an alias), so rendering never reinterprets it.
        const ws = ((await ctx.fns.procs.db.select({ sql: "SELECT workspace_dir, workspace_host FROM agents WHERE id = ?", params: [opts.agentId] })) as any[])[0] ?? {};
        const asked = String(opts.args.host ?? "").trim();
        const wsHost = String(ws.workspace_host ?? "").trim();
        const host = asked || wsHost || "local";
        const base = host === "local" ? (wsHost ? "" : String(ws.workspace_dir ?? "")) : host === wsHost ? String(ws.workspace_dir ?? "") : "";
        const absolute = path.startsWith("/") || path === "~" || path.startsWith("~/") || !base ? path : base.replace(/\/+$/, "") + "/" + path.replace(/^\.\//, "");
        const at = await ctx.fns.files.embedUrl({ path: absolute, host, mode });
        const name = at.path.split("/").filter(Boolean).pop() || at.path;
        return { args: { path: at.path, host: at.host ?? "local", mode, ...(tab ? { tab } : {}) }, title: at.host ? `${at.host}:${name}` : name };
    },
    render() {
        return '<p>Open this file in the native Canvas file tab.</p>';
    },
    describe(_ctx: Context, opts: { item: types.canvas.Item }) {
        const a = opts.item.args;
        const view = a.tab ? a.tab : a.mode && a.mode !== "auto" ? a.mode : "";
        return `file ${a.host && a.host !== "local" ? a.host + ":" : ""}${a.path}${view ? ` (${view})` : ""}`;
    },
} satisfies types.canvas.Kind;
