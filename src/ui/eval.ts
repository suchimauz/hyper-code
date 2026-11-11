/**
 * Emits JavaScript for a compatible MauzCode document to evaluate.
 * Requires the /ui/control.js compatibility consumer, retained in minimal SSR
 * ui.layout but not loaded by the primary React shell. dispatched:true confirms
 * emission only, not execution or a specific target; this call does not await a result.
 * For browser automation discover the browser plugin with plugins.search using
 * English keywords, then plugins.read and follow its Chrome/CDP prerequisites.
 * `window.open` through this UI transport may be blocked or affect the current
 * page, so it must not be used to open a new browser tab.
 *
 * @param opts.code JavaScript source sent to compatible document consumers.
 * @param opts.agent Agent associated with the operation.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
        /** JavaScript source to evaluate; no TypeScript transpilation is performed. */ code: string;
        /** Agent associated with the operation. */ agent?: any }) {
    const code = (opts.code ?? '').trim();
    if (!code) throw new Error('empty code');
    const id = 'uieval_' + Bun.randomUUIDv7().replace(/[^a-zA-Z0-9_]/g, '');
    const pending = ((ctx.state as any).uiEval ??= { pending: new Map() });
    const entry: any = { id, status: 'pending', code, createdAt: Date.now() };
    pending.pending.set(id, entry);
    ctx.fns.procs.events.emit({ event: { type: 'ui.eval', id, code } });
    return { id, dispatched: true };
}
