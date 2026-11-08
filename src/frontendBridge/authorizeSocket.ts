/**
 * Require an authenticated same-origin Vite HMR handshake
 *
 * Use from the UI Lab WebSocket upgrade hook after global middleware. Requires exact public origin and vite-hmr subprotocol; allows no other socket endpoint.
 * @param opts.req Incoming browser WebSocket handshake.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming browser WebSocket handshake. */
        req: Request;
    },
): Promise<Response | void> {
    const {req}=opts;
    if(!session || !(session as {user?:object}).user) return new Response('Authentication required',{status:401});
    if(req.method!=='GET' || new URL(req.url).pathname!=='/ui-lab/hmr') return new Response('Invalid endpoint',{status:400});
    const origin=req.headers.get('origin');
    if(!origin || origin!==await ctx.fns.http.publicOrigin({req})) return new Response('Cross-origin WebSocket rejected',{status:403});
    if(req.headers.get('sec-websocket-protocol')!=='vite-hmr') return new Response('vite-hmr required',{status:400});
}
