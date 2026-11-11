/**
 * Register a server-side file tab and emit compatibility navigation to the Files UI.
 * A consuming document may navigate away from chat; the primary React shell does
 * not load /ui/control.js. opened records the file, not confirmed browser navigation.
 *
 * To show a file to the person beside the chat use canvas.show({ kind: "file", args: { path } }) instead.
 * @param opts.path Workspace-relative file path.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
        /** Workspace-relative path to open. */ path: string }) {
    const resolved = ctx.fns.files.resolveSafe({ path: opts.path });
    // files.open maintains the server-side tab list, but its historical event is
    // not a browser navigation command. Use the same ui.navigate transport as
    // openAgent; navigation still depends on a compatible document consumer.
    ctx.fns.files.open({ path: resolved, broadcast: false });
    const url = await ctx.fns.files.browserUrl({ path: resolved });
    ctx.fns.procs.events.emit({ event: { type: "ui.navigate", path: url } });
    return { opened: resolved, url };
}
