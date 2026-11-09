import { posix } from "node:path";

/**
 * Resolves which file a native Canvas file tab may touch: its pinned path, or a path inside the tab's tree root.
 *
 * Use at the Canvas file HTTP boundary (read, save, list, raw document) before any file access. The root is
 * the item's stored `args.root`, else the pinned path when it is a directory, else the pinned file's parent.
 * A requested path is resolved against that root and refused when it escapes it; the pinned path itself is
 * returned when nothing is requested. Never accepts a host from the browser — the host is the item's own.
 * @param opts.item Open canvas file item owned by the authorised agent.
 * @param opts.path Requested absolute path or path relative to the tree root; omit for the pinned target.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Open canvas file item owned by the authorised agent. */
        item: types.canvas.Item;
        /** Requested absolute path or path relative to the tree root; omit for the pinned target. */
        path?: string;
    },
): Promise<{ ok: true; path: string; root: string; host?: string } | { ok: false; status: number; error: string }> {
    const pinned = posix.resolve(String(opts.item.args.path ?? "/"));
    const host = opts.item.args.host && opts.item.args.host !== "local" ? String(opts.item.args.host) : undefined;
    let root = typeof opts.item.args.root === "string" && opts.item.args.root.startsWith("/") ? posix.resolve(opts.item.args.root) : "";
    if (!root) root = (await ctx.fns.files.stat({ path: pinned, host }).catch(() => null))?.isDir ? pinned : posix.dirname(pinned);
    if (opts.path === undefined || opts.path === "") return { ok: true, path: pinned, root, host };
    const target = posix.resolve(root, opts.path);
    if (target !== root && !target.startsWith(root.replace(/\/+$/, "") + "/")) return { ok: false, status: 403, error: "Path outside the tab tree" };
    return { ok: true, path: target, root, host };
}
