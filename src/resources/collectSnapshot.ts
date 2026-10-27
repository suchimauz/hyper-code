/**
 * Collect cached local machine and Hyper process-tree resources
 *
 * Read Linux procfs on demand using a shared two-second cache with concurrent request coalescing and no subprocesses or timers. Other platforms expose unavailable process metrics and a known server count of one.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<types.resources.Snapshot> {
    const state = ctx.state.resources ??= {};
    if (state.pending) return structuredClone(await state.pending);
    if (state.cached && Date.now() - state.cached.sampledAt < 2000) return structuredClone(state.cached);
    const task = (async (): Promise<types.resources.Snapshot> => {
        const os = await import('node:os');
        const fs = await import('node:fs/promises');
        const sampledAt = Date.now(), host = os.hostname(), platform = os.platform(), cpuCount = os.cpus().length;
        if (platform !== 'linux') return { sampledAt, host, platform, cpuCount, cpu: {machine:null,hyper:null}, memory: {total:os.totalmem(),used:os.totalmem()-os.freemem(),hyper:null}, swap:{total:null,used:null,hyper:null}, processCount:1, groups:[{name:'Hyper (только основной процесс)',count:1,cpu:null,memory:null,swap:null}],memoryBasis:'unavailable',supported:false,note:'Для сбора процессов нужен Linux procfs; показан только основной процесс, а не всё дерево.' };
        const safe = async (path: string): Promise<string|null> => { try { return await fs.readFile(path,'utf8'); } catch { return null; } };
        let enumerationComplete = true;
        let pids: number[] = [];
        try { pids = (await fs.readdir('/proc')).filter(n=>/^\d+$/.test(n)).map(Number); } catch (error) { enumerationComplete = false; }
        const processes: types.resources.Reading['processes'] = [];
        // Bound fan-out and read expensive smaps only for descendants.
        for (let i=0;i<pids.length;i+=32) processes.push(...await Promise.all(pids.slice(i,i+32).map(async pid=>({pid,stat:await safe('/proc/'+pid+'/stat'),status:null,smaps:null}))));
        const ids=new Set([process.pid]);let changed=true;while(changed){changed=false;for(const p of processes){const end=p.stat?.lastIndexOf(')')??-1;const parent=end>=0?Number(p.stat!.slice(end+2).trim().split(/\s+/)[1]):NaN;if(ids.has(parent)&&!ids.has(p.pid)){ids.add(p.pid);changed=true;}}}
        for (const p of processes) if(ids.has(p.pid)) {
            [p.status,p.smaps]=await Promise.all([safe('/proc/'+p.pid+'/status'),safe('/proc/'+p.pid+'/smaps_rollup')]);
            const again=await safe('/proc/'+p.pid+'/stat');
            const start=(s:string|null)=>s?.slice(s.lastIndexOf(')')+2).trim().split(/\s+/)[19];
            if(!again||start(again)!==start(p.stat))p.stat=null;
        }
        const [stat,meminfo]=await Promise.all([safe('/proc/stat'),safe('/proc/meminfo')]);
        const reduced=await ctx.fns.resources.reduceReading({reading:{sampledAt,host,cpuCount,rootPid:process.pid,totalMemory:os.totalmem(),freeMemory:os.freemem(),stat,meminfo,enumerationComplete,processes},previous:state.previous});
        state.previous=reduced.previous;
        const scopeNote = 'Учтены только локальные дочерние процессы сервера, видимые в procfs; удалённые задачи и отдельные процессы БД исключены. Чтение procfs не атомарно: краткоживущие процессы и процессы со сменившимся родителем могут отсутствовать.';
        reduced.snapshot.note = [reduced.snapshot.note, scopeNote].filter(Boolean).join(' ');
        return reduced.snapshot;
    })();
    state.pending=task;
    try {const result=await task;state.cached=result;return structuredClone(result);} finally {state.pending=undefined;}
}
