/**
 * Render one agent-bound Canvas item as an isolated compatibility document.
 *
 * Use for React Canvas content frames, without the legacy application layout. Resolves items only within the requested agent; untrusted HTML and URL kinds keep their own sandboxed nested frames.
 * @param opts.req Authenticated HTTP request used for CSRF token and fragment selection.
 * @param opts.agentId Agent whose open items may be rendered.
 * @param opts.itemId Open item ID belonging to this agent.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Authenticated HTTP request used for CSRF token and fragment selection. */
        req: Request;
        /** Agent whose open items may be rendered. */
        agentId: string;
        /** Open item ID belonging to this agent. */
        itemId: number;
    },
): Promise<Response> {
    const item = (await ctx.fns.canvas.list({agentId:opts.agentId})).find(i=>i.id===opts.itemId);
    if(!item) return new Response("No such Canvas item",{status:404});
    const kind = ctx.state.canvas?.kinds?.[item.kind];
    if(!kind) return new Response("Canvas kind unavailable",{status:404});
    const esc = (text:string)=>ctx.fns.procs.ui.escape({text});
    const rev = await ctx.fns.canvas.revision({agentId:opts.agentId});
    const bodyRev = Bun.hash(JSON.stringify([item.id,item.kind,item.args,kind.liveState ? null : item.state])).toString(36);
    const body = await kind.render(ctx,{agentId:opts.agentId,item});
    const panel = `<section data-canvas-panel data-canvas-rev="${esc(rev.panel)}" style="height:100%;display:flex;flex-direction:column"><div data-canvas-body data-canvas-item="${item.id}" data-canvas-kind="${esc(item.kind)}" data-canvas-state="${esc(JSON.stringify(item.state))}" data-canvas-body-rev="${esc(bodyRev)}" style="flex:1;min-height:0;overflow:auto">${body}</div></section>`;
    const headers = {"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","content-security-policy":"frame-ancestors 'self'; object-src 'none'; base-uri 'self'"};
    if(new URL(opts.req.url).searchParams.has("fragment")) return new Response(panel,{headers});
    const token = await ctx.fns.auth.csrfToken({req:opts.req});
    const styles = (ctx.state.procs?.styles ?? []).map(st=>`<link rel="stylesheet" href="${esc(st.href)}">`).join("");
    return new Response(`<!doctype html><html data-theme="${new URL(opts.req.url).searchParams.get("theme")==="dark"?"dark":"light"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="csrf-token" content="${esc(token)}"><link rel="stylesheet" href="/ui/vendor/medeo.css"><link rel="stylesheet" href="/ui/vendor/phosphor.css">${styles}<style>html,body{margin:0;height:100%;overflow:hidden}body{font-family:system-ui,sans-serif}#canvas-document{height:100%}</style><script src="/procs/ui/htmx.js" defer></script><script src="/procs/events/client.js" defer></script><script src="/ui/control.js" defer></script><script src="/ui/rpc.js?v=6" defer></script><script src="/canvas/canvas.js" defer></script></head><body><main id="canvas-document" data-page="agent" data-canvas-agent="${esc(opts.agentId)}" data-canvas-document="${item.id}" data-canvas-open>${panel}</main></body></html>`,{headers});
}
