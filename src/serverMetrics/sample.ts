import * as os from 'node:os';
import { readdir, readFile } from 'node:fs/promises';
type Proc = { pid: number; name: string; state: string; rss: number; cpu: number | null };
type Snapshot = { sampledAt: number; platform: string; cpu: number | null; cores: (number | null)[]; memory: { total: number; used: number; available: number }; swap: { total: number; used: number } | null; load: number[]; processes?: Proc[]; processCount?: number; truncated?: boolean; processError?: string; };
type Cache = { summary?: Snapshot; details?: Snapshot; pending?: Promise<Snapshot>; previous?: { totals: number[]; idle: number[] }; procPrevious?: { total: number; ticks: Map<number, { ticks: number; start: string }> } };
/**
 * Sample read-only CPU, memory and bounded Linux process metrics for the MauzCode server host.
 *
 * Use for the authenticated owner resource monitor, never for a workspace or SSH host. Shares a two-second cache and in-flight work. Linux process data contains only PID, short kernel name, state, resident memory and sampled CPU; command lines and environment are never read. Process scanning is capped at 4096 PIDs and results at 200. CPU is null until a second sample exists.
 * @param opts.details Include per-core CPU and up to 200 processes on Linux. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Include per-core CPU and up to 200 processes on Linux. @default false */
        details?: boolean;
    },
): Promise<Snapshot> {
    const state = ctx.state as typeof ctx.state & { serverResourceCache?: Cache };
    const cache = state.serverResourceCache ??= {};
    const cached = opts.details ? cache.details : cache.summary;
    if (cached && Date.now() - cached.sampledAt < 2000) return cached;
    if (cache.pending) { await cache.pending; return await ctx.fns.serverMetrics.sample(opts); }
    const pending = (async (): Promise<Snapshot> => {
     const cpus = os.cpus();
     const totals = cpus.map(c => Object.values(c.times).reduce((a,b) => a+b,0));
     const idle = cpus.map(c => c.times.idle);
     const old = cache.previous;
     const cores = totals.map((total,i) => { const delta = old ? total - (old.totals[i] ?? total) : 0; return delta > 0 ? Math.max(0,Math.min(100,100*(1-((idle[i] ?? 0)-(old?.idle[i] ?? idle[i] ?? 0))/delta))) : null; });
     const totalDelta = old ? totals.reduce((sum,t,i) => sum + Math.max(0,t-(old.totals[i] ?? t)),0) : 0;
     const idleDelta = old ? idle.reduce((sum,t,i) => sum + Math.max(0,t-(old.idle[i] ?? t)),0) : 0;
     cache.previous = {totals,idle};
     let memory = {total:os.totalmem(),used:os.totalmem()-os.freemem(),available:os.freemem()};
     let swap: Snapshot['swap'] = null;
     if (os.platform() === 'linux') {
      const text = await readFile('/proc/meminfo','utf8');
      const mem = Object.fromEntries([...text.matchAll(/^(\w+):\s+(\d+) kB/gm)].map(m => [m[1],Number(m[2])*1024]));
      memory = {total:mem.MemTotal,available:mem.MemAvailable ?? mem.MemFree,used:mem.MemTotal-(mem.MemAvailable ?? mem.MemFree)};
      swap = {total:mem.SwapTotal,used:mem.SwapTotal-mem.SwapFree};
     }
     const result: Snapshot = {sampledAt:Date.now(),platform:os.platform(),cpu:totalDelta>0?Math.max(0,Math.min(100,100*(1-idleDelta/totalDelta))):null,cores,memory,swap,load:os.loadavg()};
     if (opts.details && os.platform() === 'linux') {
      const names = (await readdir('/proc')).filter(n => /^\d+$/.test(n));
      const total = (await readFile('/proc/stat','utf8')).split('\n')[0]!.trim().split(/\s+/).slice(1,9).reduce((a,v)=>a+Number(v),0);
      const previous = cache.procPrevious;
      const ticks = new Map<number,{ticks:number;start:string}>();
      const processes: Proc[] = [];
      const selected = names.slice(0,4096);
      let unavailable = 0;
      for (let i=0;i<selected.length;i+=32) await Promise.all(selected.slice(i,i+32).map(async name => {
       try {
        const [stat,status] = await Promise.all([readFile('/proc/'+name+'/stat','utf8'),readFile('/proc/'+name+'/status','utf8')]);
        const end = stat.lastIndexOf(')'); const fields = stat.slice(end+2).trim().split(/\s+/);
        const pid=Number(name), value=Number(fields[11])+Number(fields[12]), start=fields[19] ?? ''; 
        ticks.set(pid,{ticks:value,start});
        const before = previous?.ticks.get(pid); const delta=previous?total-previous.total:0;
        processes.push({pid,name:stat.slice(stat.indexOf('(')+1,end).replace(/[\x00-\x1f\x7f]/g,'').slice(0,64),state:fields[0] ?? '?',rss:Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0)*1024,cpu:before && before.start===start&&delta>0?Math.max(0,(value-before.ticks)/delta*cpus.length*100):null});
       } catch { unavailable++; /* Exited or inaccessible processes are expected while sampling procfs. */ }
      }));
      cache.procPrevious={total,ticks};
      processes.sort((a,b)=>(b.cpu??0)-(a.cpu??0)||b.rss-a.rss||a.pid-b.pid);
      result.processes=processes.slice(0,200); result.processCount=names.length; result.truncated=names.length>4096||processes.length>200;
      if (unavailable) result.processError=unavailable+' процессов завершились или недоступны';
     } else if (opts.details) result.processError='Список процессов доступен только на Linux';
     cache.summary={...result,cores:[],processes:undefined,processCount:undefined,truncated:undefined,processError:undefined};
     if (opts.details) cache.details=result;
     return opts.details ? result : cache.summary;
    })();
    cache.pending=pending;
    try { return await pending; } finally { cache.pending=undefined; }
}
