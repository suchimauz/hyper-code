// Fixed upstream, no browser headers/cookies forwarded. Vite's query token is
// copied only to this fixed HMR endpoint, never interpreted as an address.
const LIMIT = 256 * 1024;
type Bridge = {upstream?: WebSocket; queue: (string | Buffer)[]; bytes: number; closed: boolean; timer?: ReturnType<typeof setTimeout>};
export default {
    async upgrade(ctx: Context, _session: Session | null, opts: {req: Request}) {
        const denied = await ctx.fns.frontendBridge.authorizeSocket({req: opts.req});
        if (denied) return denied;
        return {queue: [], bytes: 0, closed: false} satisfies Bridge;
    },
    open(_ctx: Context, _session: Session | null, {ws}: {ws: any}) {
        const state: Bridge = ws.data.state;
        const query = new URL(ws.data.url).search;
        const up = state.upstream = new WebSocket('ws://127.0.0.1:5174/ui-lab/hmr' + query, 'vite-hmr');
        up.binaryType = 'arraybuffer';
        const shutdown = () => {
            if(state.closed) return;
            state.closed = true;
            clearTimeout(state.timer);
            state.queue.length = 0; state.bytes = 0;
            up.close(); ws.close(1011, 'HMR upstream disconnected');
        };
        state.timer = setTimeout(shutdown, 10000);
        up.onopen = () => {
            clearTimeout(state.timer);
            if(state.closed) {up.close(); return;}
            for(const data of state.queue) up.send(data);
            state.queue.length = 0; state.bytes = 0;
        };
        up.onmessage = event => {
            if(state.closed) return;
            const data = event.data;
            const size = typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength;
            if(size > LIMIT || ws.getBufferedAmount() + size > LIMIT) {shutdown(); return;}
            const sent = ws.send(data);
            if(sent === 0) shutdown();
        };
        up.onerror = shutdown;
        up.onclose = shutdown;
    },
    message(_ctx: Context, _session: Session | null, {ws, message}: {ws: any; message: string | Buffer}) {
        const state: Bridge = ws.data.state;
        if(state.closed) return;
        const size = Buffer.byteLength(message);
        const up = state.upstream;
        if(size > LIMIT || state.bytes + (up?.bufferedAmount ?? 0) + size > LIMIT) {
            ws.close(1009, 'HMR buffer limit'); up?.close(); return;
        }
        if(up?.readyState === WebSocket.OPEN) up.send(message);
        else {state.queue.push(message);state.bytes += size;}
    },
    close(_ctx: Context, _session: Session | null, {ws}: {ws: any}) {
        const state: Bridge = ws.data.state;
        state.closed = true; clearTimeout(state.timer);
        state.queue.length = 0; state.bytes = 0;
        state.upstream?.close();
    },
};
