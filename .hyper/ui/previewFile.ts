/**
 * Opens a file or directory in the current agent's native Canvas Files tab.
 *
 * Use when the user asks to inspect files without leaving the chat. Paths are pinned
 * to the resolved workspace host; private result-store files are rejected. Generic
 * HTTP RPC calls are refused because they do not establish an owned agent context.
 * @param opts.path Workspace-relative or absolute file or directory path to open.
 * @param opts.mode Initial file tab. Auto uses the Files UI default. @default auto
 * @param opts.title Optional Canvas tab title; defaults to the resolved file path.
 * @param opts.maxChars Deprecated compatibility option; Files UI loads the complete file. @default 200000 @minimum 1 @maximum 1000000
 * @param opts.host SSH host alias the path lives on; omitted means the agent workspace (remote when it has a host).
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Workspace-relative or absolute file or directory path to open. */
        path: string;
        /** Initial file tab. Auto uses the Files UI default. @default auto */
        mode?: "auto" | "preview" | "source";
        /** Optional Canvas tab title; defaults to the resolved file path. */
        title?: string;
        /** Deprecated compatibility option; Files UI loads the complete file. @default 200000 @minimum 1 @maximum 1000000 */
        maxChars?: number;
        /** SSH host alias the path lives on; omitted means the agent workspace (remote when it has a host). */
        host?: string;
    },
): Promise<Response | { path: string; host: string | null; mode: "auto" | "preview" | "source"; url: string; itemId: number }> {
    // Generic RPC cannot establish the owned agent context required by Canvas.
    if (session?.url?.pathname === "/rpc") {
        return new Response("Open files from an owned agent's Canvas instead.", { status: 403 });
    }
    const mode = opts.mode ?? "auto";
    const { path, host, url } = await ctx.fns.files.embedUrl({ path: opts.path, host: opts.host, mode });
    if (await ctx.fns.files.isPrivateResult({ path, host: host ?? undefined })) {
        throw new Error("file not found");
    }
    const title = opts.title ?? (host ? `${host}:${path}` : path);
    const item = await ctx.fns.canvas.show({
        kind: "file", args: { path, host: host ?? "local", mode }, title,
    });
    return { path, host, mode, url, itemId: item.id };
}
