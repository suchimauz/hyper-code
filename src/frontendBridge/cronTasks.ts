/**
 * List and manage Hyper cron tasks for the UI Lab Automation tasks page
 *
 * Use for the React "Automation tasks" screen. GET ?runs=<name> returns the ten latest runs of one task (status, times, clipped result and error). Plain GET returns every cron task (name, function, arguments, schedule, enabled status, worker state, next and last run) plus a cookie-bound CSRF token. POST accepts one JSON action — defer (one-shot delay in every), add (name, dotted fn, interval string, optional JSON-object args and run-now flag; refuses existing names), or enable, disable, run or remove for an exact task name after owner, same-origin, CSRF, content-type and size checks, and delegates to the native cron.add, cron.setEnabled, cron.runNow and cron.remove procedures.
 * @param opts.req Authenticated owner GET, or CSRF-protected JSON POST with name and action.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Authenticated owner GET, or CSRF-protected JSON POST with name and action. */
        req: Request;
    },
): Promise<Response> {
    const headers={'Cache-Control':'no-store','Vary':'Cookie'};
    const reply=(body:object,status=200)=>Response.json(body,{status,headers});
    const user=(session as Session & {user?:{id:string;role?:string}})?.user;
    if(!user)return reply({error:'Unauthorized'},401);
    const req=opts.req;
    if(!['GET','POST'].includes(req.method))return new Response(null,{status:405,headers:{...headers,Allow:'GET, POST'}});
    if(user.role!=='owner')return reply({error:'Only owners can manage automation tasks'},403);
    const num=(v:unknown)=>v==null?null:Number(v);
    if(req.method==='GET'){
        const runsOf=new URL(req.url).searchParams.get('runs');
        if(runsOf!=null){
            if(!runsOf||runsOf.length>200)return reply({error:'Invalid task name'},400);
            try{
                const rows=await ctx.fns.cron.runs({name:runsOf,limit:10});
                const clip=(v:unknown)=>{if(v==null)return null;const s=typeof v==='string'?v:JSON.stringify(v);return s.length>2000?s.slice(0,2000)+'…':s;};
                return reply({runs:rows.map((r:any)=>({id:String(r.id),scheduledAt:num(r.scheduledAt),startedAt:num(r.startedAt),finishedAt:num(r.finishedAt),status:String(r.status),result:clip(r.result),error:clip(r.error)}))});
            }catch(error){return reply({error:error instanceof Error?error.message:'Could not load runs'},500);}
        }
        try{
            const rows=await ctx.fns.cron.list({limit:500});
            const tasks=rows.map((t:any)=>({name:String(t.name),fn:String(t.fn),args:t.args??{},scheduleType:String(t.scheduleType),everyMs:num(t.everyMs),nextRunAt:num(t.nextRunAt),enabled:!!t.enabled,state:String(t.state),source:String(t.source),sourceFile:t.sourceFile??null,lastStatus:t.lastStatus??null,lastStartedAt:num(t.lastStartedAt),lastFinishedAt:num(t.lastFinishedAt),lastError:t.lastError??null}));
            return reply({tasks,csrfToken:await ctx.fns.auth.csrfToken({req})});
        }catch(error){return reply({error:error instanceof Error?error.message:'Could not load automation tasks'},500);}
    }
    if(req.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Same origin required'},403);
    if(!await ctx.fns.auth.verifyCsrf({req,token:req.headers.get('x-csrf-token')||''}))return reply({error:'Invalid request token'},403);
    if(req.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')return reply({error:'JSON body required'},415);
    const raw=await req.text();if(raw.length>4096)return reply({error:'Request too large'},413);
    let data:{name?:unknown;action?:unknown;fn?:unknown;every?:unknown;args?:unknown;now?:unknown};try{data=JSON.parse(raw);}catch{return reply({error:'Invalid JSON'},400);}
    if(data&&typeof data==='object'&&(data.action==='add'||data.action==='defer')){
        if(Object.keys(data).some(k=>!['name','action','fn','every','args','now'].includes(k)))return reply({error:'Invalid task fields'},400);
        const name=typeof data.name==='string'?data.name.trim():'';
        const fn=typeof data.fn==='string'?data.fn.trim():'';
        if(!name||name.length>200)return reply({error:'Task name is required'},400);
        if(!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(fn)||fn.length>200)return reply({error:'Function must be a dotted runtime name, e.g. module.fn'},400);
        if(typeof data.every!=='string'||!data.every.trim()||data.every.length>50)return reply({error:'Interval is required, e.g. 5m or 1h 30m'},400);
        if(data.args!==undefined&&(!data.args||typeof data.args!=='object'||Array.isArray(data.args)))return reply({error:'Arguments must be a JSON object'},400);
        if(data.now!==undefined&&typeof data.now!=='boolean')return reply({error:'Invalid run-now flag'},400);
        if((await ctx.fns.cron.list({name,limit:1})).length)return reply({error:'A task with this name already exists'},409);
        try{const task=data.action==='defer'?await ctx.fns.cron.defer({name,fn,in:data.every.trim(),args:(data.args??{}) as Record<string,any>}):await ctx.fns.cron.add({name,fn,every:data.every.trim(),args:(data.args??{}) as Record<string,any>,now:data.now===true});return reply({ok:true,task});}
        catch(error){return reply({error:error instanceof Error?error.message:'Could not create task'},400);}
    }
    if(!data||typeof data!=='object'||Object.keys(data).some(k=>!['name','action'].includes(k))||typeof data.name!=='string'||!data.name||data.name.length>200||!['enable','disable','run','remove'].includes(String(data.action)))return reply({error:'Invalid task action'},400);
    const name=data.name;
    if(!(await ctx.fns.cron.list({name,limit:1})).length)return reply({error:'Task not found'},404);
    try{
        if(data.action==='enable'||data.action==='disable')await ctx.fns.cron.setEnabled({name,enabled:data.action==='enable'});
        else if(data.action==='run')await ctx.fns.cron.runNow({name});
        else await ctx.fns.cron.remove({name});
        return reply({ok:true});
    }catch(error){return reply({error:error instanceof Error?error.message:'Action failed'},409);}
}
