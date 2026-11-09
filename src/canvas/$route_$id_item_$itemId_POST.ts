// POST /canvas/:id/item/:itemId — a canvas tab talks back. JSON body { state } merges keys into the tab's
// state (canvas.setState; the agent reads it next turn), { ping: { text, data? } } wakes the agent
// (canvas.ping). canvas.js forwards these from the tab's sandboxed page, which cannot call us itself.
/** Saves a canvas tab's state or pings its agent from the browser. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }): Promise<Response> {
    const agentId = String(opts.params.id ?? "");
    const denied = await ctx.fns.canvas.authorizeHttp({ req: opts.req, agentId });
    if (denied) return denied;
    if (!(await ctx.fns.auth.verifyCsrf({ req: opts.req, token: opts.req.headers.get('x-csrf-token') ?? '' }))) return new Response('Invalid CSRF token', { status: 403 });
    const itemId = Number(opts.params.itemId);
    if (!Number.isInteger(itemId)) return new Response("invalid item id", { status: 400 });
    const body: any = await opts.req.json().catch(() => null);
    if (!body || typeof body !== "object") return new Response("JSON body required", { status: 400 });
    try {
        const out: Record<string, unknown> = {};
        // Native React file transport: targets come only from this agent's open item — its pinned path, or an
        // optional body.path inside the item's tree root (the workspace browser on the left of the tab).
        if (body.fileAction === 'read' || body.fileAction === 'save' || body.fileAction === 'list') {
            const item = (await ctx.fns.canvas.list({ agentId })).find(i => i.id === itemId && i.kind === 'file');
            if (!item) return new Response('No such file item', { status: 404 });
            const target = await ctx.fns.canvas.fileTarget({ item, path: body.path === undefined ? undefined : String(body.path) });
            if (!target.ok) return new Response(target.error, { status: target.status });
            const { path, root, host } = target;
            if (await ctx.fns.files.isPrivateResult({ path, host })) return new Response('File unavailable', { status: 404 });
            const info = await ctx.fns.files.stat({ path, host });
            if (!info) return new Response('File unavailable', { status: 404 });
            if (body.fileAction === 'list' && !info.isDir) return new Response('Not a directory', { status: 400 });
            if (info.isDir) {
                if (body.fileAction === 'save') return new Response('Cannot save directory', { status: 400 });
                const entries = [];
                for (const entry of await ctx.fns.files.list({ path, host })) {
                    const child = path.replace(/\/$/, '') + '/' + entry.name;
                    if (!await ctx.fns.files.isPrivateResult({ path: child, host })) entries.push(entry);
                }
                return Response.json({ path, root, isDir: true, entries });
            }
            const extension = path.split('.').pop()?.toLowerCase() ?? '';
            const previewKind = /^(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/.test(extension) ? 'image'
                : /^(mp4|webm|mov|m4v|ogv)$/.test(extension) ? 'video'
                : /^(mp3|wav|ogg|oga|m4a|aac|flac|opus)$/.test(extension) ? 'audio'
                : extension === 'pdf' ? 'pdf' : /^(html?|svg)$/.test(extension) ? 'html'
                : /^(md|markdown)$/.test(extension) ? 'markdown' : 'text';
            if (['image', 'video', 'audio', 'pdf'].includes(previewKind) || info.size > 1024 * 1024) {
                if (body.fileAction === 'save') return new Response('File is not editable text', { status: 400 });
                return Response.json({ path, root, preview: true, previewKind: previewKind === 'text' || previewKind === 'markdown' || previewKind === 'html' ? 'download' : previewKind, size: info.size });
            }
            const content = await ctx.fns.files.read({ path, host });
            if (content.includes('\u0000')) {
                if (body.fileAction === 'save') return new Response('File is not editable text', { status: 400 });
                return Response.json({ path, root, preview: true, previewKind: 'download', size: info.size });
            }
            if (body.fileAction === 'save') {
                if (typeof body.content !== 'string' || body.content.length > 1024 * 1024) return new Response('Invalid text content', { status: 400 });
                if (body.expectedContent !== content) return new Response('File changed on disk; reload before saving', { status: 409 });
                await ctx.fns.files.write({ path, host, content: body.content, expectedContent: content });
                return Response.json({ path, root, content: body.content, previewKind });
            }
            return Response.json({ path, root, content, previewKind });
        }
        if (body.state && typeof body.state === "object" && !Array.isArray(body.state)) out.state = (await ctx.fns.canvas.setState({ agentId, itemId, state: body.state })).state;
        if (body.ping) out.ping = await ctx.fns.canvas.ping({ agentId, itemId, text: String(body.ping.text ?? ""), data: body.ping.data });
        if (!Object.keys(out).length) return new Response("nothing to do: pass state or ping", { status: 400 });
        return Response.json(out);
    } catch (error: any) {
        const message = String(error?.message ?? error);
        return new Response(message, { status: /rate limit/.test(message) ? 429 : /no tab/.test(message) ? 404 : 400 });
    }
}
