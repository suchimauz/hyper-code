/**
 * Fetch a response through an explicit model transport
 *
 * Use for ResolvedConnection.fetch. Refuse redirects, credentials and non-HTTPS proxy destinations; never fall back. Deadline and cancellation cover setup and streamed bodies. Proxy requests support GET/POST and eight MiB bodies. Connection-id resolution belongs to the later connection layer.
 * @param opts.transport Saved transport bound to this connection.
 * @param opts.url Absolute credential-free HTTP(S) destination.
 * @param opts.init Request options; redirects always fail and proxy methods must be GET or POST.
 * @param opts.signal Cancellation combined with init.signal through body EOF.
 * @param opts.timeoutMs Total deadline including setup and body streaming. @default 120000 @minimum 1 @maximum 3600000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Saved transport bound to this connection. */
        transport: types.models.TransportSpec;
        /** Absolute credential-free HTTP(S) destination. */
        url: string;
        /** Request options; redirects always fail and proxy methods must be GET or POST. */
        init?: RequestInit;
        /** Cancellation combined with init.signal through body EOF. */
        signal?: AbortSignal;
        /** Total deadline including setup and body streaming. @default 120000 @minimum 1 @maximum 3600000 */
        timeoutMs?: number;
    },
): Promise<Response> {
    const error = (message: string, cause?: unknown) => Object.assign(new Error(message, {cause}), {code: 'TRANSPORT'});
    const timeout = opts.timeoutMs ?? 120000;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 3600000) throw error('Invalid transport timeout');
    let url: URL;
    try { url = new URL(opts.url); } catch (cause) { throw error('Absolute HTTP(S) URL required', cause); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw error('Credential-free HTTP(S) URL required');
    const t = opts.transport;
    if (!t || !['direct', 'socks', 'ssh-tunnel'].includes(t.kind)) throw error('Unknown transport');
    if (t.kind !== 'direct' && url.protocol !== 'https:') throw error('Proxied requests require HTTPS');
    const controller = new AbortController(), signal = controller.signal;
    const sources = [opts.signal, opts.init?.signal].filter((s): s is AbortSignal => !!s);
    const abort = () => controller.abort(error('Transport cancelled'));
    const timer = setTimeout(() => controller.abort(error('Transport timed out')), timeout);
    let lease: {release: () => void; signal: AbortSignal} | undefined;
    let released = false, finished = false;
    const release = () => { if (lease && !released) { released = true; lease.release(); } };
    let reader: {read: () => Promise<{done: boolean; value?: Uint8Array}>; cancel: (reason?: unknown) => Promise<void>} | undefined;
    let output: ReadableStreamDefaultController<Uint8Array> | undefined;
    const cleanup = () => {
     if (finished) return;
     finished = true; clearTimeout(timer);
     for (const source of sources) source.removeEventListener('abort', abort);
     signal.removeEventListener('abort', cancelled);
     lease?.signal.removeEventListener('abort', abort);
     release();
    };
    const cancelled = () => {
     output?.error(signal.reason);
     if (reader) void reader.cancel(signal.reason).catch(() => undefined);
     cleanup();
    };
    const bounded = <T>(promise: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
     const stop = () => reject(signal.reason);
     if (signal.aborted) { void promise.catch(() => undefined); reject(signal.reason); return; }
     signal.addEventListener('abort', stop, {once:true});
     void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
    });
    signal.addEventListener('abort', cancelled, {once:true});
    for (const source of sources) { source.addEventListener('abort', abort, {once:true}); if (source.aborted) abort(); }
    try {
     signal.throwIfAborted();
     let response: Response;
     if (t.kind === 'direct') response = await bounded(globalThis.fetch(url.href, {...opts.init, signal, redirect:'error'}));
     else {
      const request = new Request(url.href, {...opts.init, signal, redirect: 'error'});
      if (!['GET', 'POST'].includes(request.method)) throw error('Proxy supports only GET and POST');
      const body = request.body ? new Uint8Array(await bounded(request.arrayBuffer())) : undefined;
      if (body && body.byteLength > 8 * 1024 * 1024) throw error('Proxy body exceeds eight MiB');
      let proxy: {host:string;port:number;username?:string;password?:string};
      if (t.kind === 'socks') proxy = await bounded(ctx.fns.socksProxy.readSaved({id:t.proxyId}));
      else {
       const acquired = await bounded(ctx.fns.sshProvider.tunnel({instance:t.instance, signal}).then(value => {
        if (signal.aborted) { value.release(); throw signal.reason; }
        lease = value; return value;
       }));
       acquired.signal.addEventListener('abort', abort, {once:true});
       if (acquired.signal.aborted) abort();
       proxy = {host:'127.0.0.1', port:acquired.port};
      }
      signal.throwIfAborted();
      response = await bounded(ctx.fns.socksProxy.request({proxy, url:url.href, method:request.method as 'GET'|'POST', headers:Object.fromEntries(request.headers), body, signal, timeoutMs:timeout, onDone:release}));
     }
     if (signal.aborted) { await response.body?.cancel(signal.reason); throw signal.reason; }
     if (!response.body) { cleanup(); return response; }
     reader = response.body.getReader();
     const body = new ReadableStream<Uint8Array>({
      start(c) { output = c; },
      async pull(c) {
       try { const next = await bounded(reader!.read()); if (finished) return; if (next.done) { c.close(); cleanup(); } else c.enqueue(next.value!); }
       catch (cause) { if (!finished) { c.error(error('Transport response failed', cause)); cleanup(); } }
      },
      // Consumer cancellation is a normal end of use: cancel the source, then abort the transport without rejecting.
      async cancel(reason) { cleanup(); await reader!.cancel(reason).catch(() => undefined); controller.abort(error('Response cancelled')); }
     });
     return new Response(body, {status:response.status, statusText:response.statusText, headers:response.headers});
    } catch (cause) { cleanup(); throw error('Model transport failed', cause); }
}
