/**
 * Check one saved SOCKS5 proxy against a fixed geolocation endpoint with instance-wide admission limits
 *
 * Checks only a saved UUID, never an arbitrary destination or unsaved credentials. Returns transient safe result metadata and the saved revision for stale-result rejection. Enforces one check per record, three concurrent checks and thirty starts per rolling minute across this runtime context. Rate-limited results must be mapped to HTTP 429 with Retry-After by the authorized route.
 * @param opts.id UUID of the saved proxy record to check.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** UUID of the saved proxy record to check. */
        id: string;
    },
): Promise<{ok:boolean;revision:number;checkedAt:string;durationMs:number;code?:string;retryAfter?:number;query?:string;country?:string;regionName?:string;city?:string;isp?:string;org?:string;as?:string;timezone?:string}> {
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opts.id))throw Object.assign(new Error('Invalid proxy ID'),{status:400});
    const started=performance.now();
    const id=opts.id.toLowerCase();
    ctx.state.socksProxy ??= {};
    const state=ctx.state.socksProxy as {checks?:{active:Set<string>;starts:number[];upstreamUntil?:number}};
    const limits=state.checks??= {active:new Set<string>(),starts:[]};
    const now=Date.now();limits.starts=limits.starts.filter(t=>now-t<60000);
    const meta=(revision:number)=>({revision,checkedAt:new Date().toISOString(),durationMs:Math.round(performance.now()-started)});
    if((limits.upstreamUntil??0)>now)return {ok:false,code:'rate_limit',retryAfter:Math.max(1,Math.ceil((limits.upstreamUntil!-now)/1000)),...meta(0)};
    if(limits.active.has(id)||limits.active.size>=3||limits.starts.length>=30){return {ok:false,code:'rate_limit',retryAfter:limits.starts.length>=30?Math.max(1,Math.ceil((limits.starts[0]!+60000-now)/1000)):1,...meta(0)};}
    limits.active.add(id);
    const controller=new AbortController();
    const signal=controller.signal;
    const requestSignal=session?.req?.signal;
    const cancel=()=>controller.abort(new DOMException('Cancelled','AbortError'));
    const timer=setTimeout(()=>controller.abort(new DOMException('Deadline','TimeoutError')),Math.max(1,10000-(performance.now()-started)));
    requestSignal?.addEventListener('abort',cancel,{once:true});
    if(requestSignal?.aborted)cancel();
    let stopWait:(()=>void)|undefined;
    try {
     const stopped=new Promise<never>((_,reject)=>{stopWait=()=>reject(signal.reason);if(signal.aborted)stopWait();else signal.addEventListener('abort',stopWait,{once:true});});
     const proxy=await Promise.race([ctx.fns.socksProxy.readSaved({id}),stopped]);
     // Reading storage is asynchronous: recheck the rolling-window budget before starting transport.
     const admittedAt=Date.now();limits.starts=limits.starts.filter(t=>admittedAt-t<60000);
     if(limits.starts.length>=30)return {ok:false,code:'rate_limit',retryAfter:Math.max(1,Math.ceil((limits.starts[0]!+60000-admittedAt)/1000)),...meta(proxy.revision)};
     limits.starts.push(admittedAt);
     const result=await ctx.fns.socksProxy.probeTransport({proxy,signal});
     if(result.code==='rate_limit')limits.upstreamUntil=Date.now()+Math.min(3600,Math.max(1,result.retryAfter??60))*1000;
     return {...result,...meta(proxy.revision)};
    } catch(error) {
     if(signal.aborted)return {ok:false,code:signal.reason?.name==='TimeoutError'?'timeout':'cancelled',...meta(0)};
     throw error;
    } finally {clearTimeout(timer);requestSignal?.removeEventListener('abort',cancel);if(stopWait)signal.removeEventListener('abort',stopWait);limits.active.delete(id);}
}
