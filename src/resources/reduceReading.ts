/**
 * Aggregate Linux procfs readings into a resource snapshot
 *
 * Use for deterministic collector fixtures and live procfs readings. Tracks only the root process and descendants, rejects incomplete identities, prefers PSS and falls back to complete RSS.
 * @param opts.reading Captured procfs files and host metadata; failed reads are null.
 * @param opts.previous Previous machine counters and complete-tree process counters; omit for initial sample.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Captured procfs files and host metadata; failed reads are null. */
        reading: types.resources.Reading;
        /** Previous machine counters and complete-tree process counters; omit for initial sample. */
        previous?: types.resources.State["previous"];
    },
): Promise<{ snapshot: types.resources.Snapshot; previous: types.resources.State["previous"] }> {
    const r = opts.reading;
    const kb = (s: string|null,k:string):number|null => {const m=s?.match(new RegExp('^'+k+':\\s+(\\d+) kB$','m'));return m?Number(m[1])*1024:null;};
    const ps=r.processes.map(p=>{const end=p.stat?.lastIndexOf(')')??-1;const f=end>=0?p.stat!.slice(end+2).trim().split(/\s+/):[]; const n=(i:number)=>Number(f[i]);return {...p,name:p.stat?.slice(p.stat.indexOf('(')+1,end)??'Неизвестный процесс',parent:n(1),ticks:n(11)+n(12),start:n(19),valid:f.length>=22&&[n(1),n(11),n(12),n(19)].every(Number.isFinite)};});
    const ids=new Set([r.rootPid]);let changed=true;while(changed){changed=false;for(const p of ps)if(p.valid&&ids.has(p.parent)&&!ids.has(p.pid)){ids.add(p.pid);changed=true;}}
    const tree=ps.filter(p=>ids.has(p.pid));const complete=r.enumerationComplete&&ps.every(p=>p.valid)&&tree.some(p=>p.pid===r.rootPid);
    const counters=r.stat?.match(/^cpu\s+(.+)$/m)?.[1]?.trim().split(/\s+/).slice(0,8).map(Number);
    const total=counters?.length===8&&counters.every(Number.isFinite)?counters.reduce((a,b)=>a+b,0):null;
    const idle=counters?counters[3]!+counters[4]!:null;const delta=total!==null&&opts.previous?total-opts.previous.total:0;
    const stableTree = !opts.previous || Object.keys(opts.previous.processes).every(pid => tree.some(p => String(p.pid) === pid && p.start === opts.previous!.processes[pid]!.start));
    const pct=(v:number)=>Math.max(0,Math.min(100,v*100/delta));
    const machine=delta>0&&idle!==null&&opts.previous&&idle>=opts.previous.idle?pct(delta-idle+opts.previous.idle):null;
    const pss=tree.map(p=>kb(p.smaps,'Pss')),rss=tree.map(p=>kb(p.status,'VmRSS'));
    const basis=complete&&pss.every(v=>v!==null)?'PSS':complete&&rss.every(v=>v!==null)?'RSS':'unavailable';
    const rows=tree.map((p,i)=>{const prev=opts.previous?.processes[String(p.pid)];return {name:p.name,cpu:complete&&stableTree&&delta>0&&prev?.start===p.start&&p.ticks>=prev.ticks?pct(p.ticks-prev.ticks):null,memory:basis==='PSS'?pss[i]!:basis==='RSS'?rss[i]!:null,swap:complete?kb(p.smaps,'SwapPss'):null};});
    const sum=(v:Array<number|null>):number|null=>v.length&&v.every(n=>n!==null)?v.reduce<number>((a,b)=>a+b!,0):null;
    const groups=[...new Set(rows.map(p=>p.name))].sort().map(name=>{const g=rows.filter(p=>p.name===name);return {name,count:g.length,cpu:sum(g.map(p=>p.cpu))===null?null:Math.min(100,sum(g.map(p=>p.cpu))!),memory:sum(g.map(p=>p.memory)),swap:sum(g.map(p=>p.swap))};});
    const mt=kb(r.meminfo,'MemTotal')??r.totalMemory,available=kb(r.meminfo,'MemAvailable')??r.freeMemory,st=kb(r.meminfo,'SwapTotal'),sf=kb(r.meminfo,'SwapFree');
    const notes:string[]=[];if(!complete)notes.push('Не все процессы доступны для чтения; суммарные показатели недоступны, количество процессов — нижняя граница.');if(basis==='RSS')notes.push('PSS доступен не полностью; RSS повторно учитывает общие страницы памяти.');if(basis==='unavailable')notes.push('Полные данные о памяти процессов недоступны.');if(rows.some(p=>p.swap===null))notes.push('Полные данные о пропорциональном использовании подкачки процессами недоступны.');if(rows.some(p=>p.cpu===null))notes.push('Для CPU процессов нужны два полных замера с совпадающими PID и временем запуска.');if(kb(r.meminfo,'MemAvailable')===null)notes.push('Занятая память вычислена как общая минус свободная: MemAvailable недоступен.');
    const processes:Record<string,{start:number;ticks:number}>={};for(const p of tree)if(complete&&p.valid)processes[String(p.pid)]={start:p.start,ticks:p.ticks};
    return {snapshot:{sampledAt:r.sampledAt,host:r.host,platform:'linux',cpuCount:r.cpuCount,cpu:{machine,hyper:complete&&sum(rows.map(p=>p.cpu))!==null?Math.min(100,sum(rows.map(p=>p.cpu))!):null},memory:{total:mt,used:Math.max(0,mt-available),hyper:sum(rows.map(p=>p.memory))},swap:{total:st,used:st!==null&&sf!==null?Math.max(0,st-sf):null,hyper:sum(rows.map(p=>p.swap))},processCount:tree.length,groups,memoryBasis:basis,supported:true,note:notes.length?notes.join(' '):null},previous:total!==null&&idle!==null&&Number.isFinite(idle)?{total,idle,processes}:undefined};
}
