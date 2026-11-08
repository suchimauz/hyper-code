/**
 * Read a visible chat title and direct team children or rename it with native session persistence
 *
 * Serve the authenticated UI Lab chat header. GET returns an unarchived nav or team agent and only its direct unarchived team children, with native icon and hue projections and a session-bound CSRF token. Owner-only JSON POST requires native CSRF verification and renames through session.setTitle; it never loads transcripts or creates sessions.
 * GET also returns parent {id,title} or null for a visible unarchived parent of a team session, and siblings with the same child projection (including the current session); unavailable parents yield an empty siblings list.
 * Child tokens sum native context_usage input and output (cache is already included); absent measurements stay null. durationMs sums recorded closed agent_runs boundaries plus elapsed open boundaries belonging to the currently running worker claim (started_at >= run_started_at); excludes stale open runs and idle gaps. Historical coverage can be partial. lastReplyAt is the latest native assistant event timestamp in epoch milliseconds, or null. modelLabel follows the native selector's model-route suffix.
 * @param opts.req GET with one agentId query parameter, or POST application/json {agentId,title} and X-CSRF-Token; title is trimmed and limited to 120 characters by native persistence.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** GET with one agentId query parameter, or POST application/json {agentId,title} and X-CSRF-Token; title is trimmed and limited to 120 characters by native persistence. */
        req: Request;
    },
): Promise<Response> {
    const headers={'Cache-Control':'no-store','Vary':'Cookie'};
    const reply=(body:object,status=200)=>Response.json(body,{status,headers});
    const user=(session as Session & {user?:{id:string;role?:string}})?.user;
    if(!user)return reply({error:'Unauthorized'},401);
    const req=opts.req,url=new URL(req.url);
    if(!['GET','POST'].includes(req.method))return new Response(null,{status:405,headers:{...headers,Allow:'GET, POST'}});
    let agentId:string,title='';
    if(req.method==='POST'){
     if(user.role!=='owner')return reply({error:'Owner access required'},403);
     if(req.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Same origin required'},403);
     const origin=req.headers.get('origin');
     if(origin!==null&&origin!==await ctx.fns.http.publicOrigin({req}))return reply({error:'Same origin required'},403);
     if(!await ctx.fns.auth.verifyCsrf({req,token:req.headers.get('x-csrf-token')||''}))return reply({error:'Invalid request token'},403);
     if(req.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')return reply({error:'JSON body required'},415);
     const raw=await req.text();if(raw.length>4096)return reply({error:'Request too large'},413);
     let data:Record<string,unknown>;
     try{data=JSON.parse(raw);}catch{return reply({error:'Invalid JSON'},400);}
     if(!data||Array.isArray(data)||typeof data!=='object'||Object.keys(data).some(k=>!['agentId','title'].includes(k))||typeof data.agentId!=='string'||typeof data.title!=='string')return reply({error:'Invalid chat header'},400);
     agentId=data.agentId;title=data.title;
    }else{
     const ids=url.searchParams.getAll('agentId');
     if(ids.length!==1)return reply({error:'Invalid agentId'},400);
     agentId=ids[0]!;
    }
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(agentId))return reply({error:'Invalid agentId'},400);
    const rows=await ctx.fns.procs.db.select({sql:"SELECT id,title,parent_id,visibility FROM agents WHERE id = ? AND visibility IN ('nav','team') AND archived_at IS NULL",params:[agentId]});
    if(!rows.length)return reply({error:'Agent not found'},404);
    if(req.method==='POST'){
     try{return reply({agentId,title:await ctx.fns.session.setTitle({id:agentId,title})});}
     catch(error){if(error instanceof Error&&error.message==='agent not found: '+agentId)return reply({error:'Agent not found'},404);throw error;}
    }
    const parentRows=rows[0].visibility==='team'&&rows[0].parent_id?await ctx.fns.procs.db.select({sql:"SELECT id,title FROM agents WHERE id = ? AND visibility IN ('nav','team') AND archived_at IS NULL",params:[rows[0].parent_id]}):[];
    const parent=parentRows.length?{id:String(parentRows[0].id),title:String(parentRows[0].title??'').trim()||String(parentRows[0].id)}:null;
    const now=Date.now();
    const loadChildren=async(parentId:string)=>{
    const children=await ctx.fns.procs.db.select({sql:`SELECT id,title,icon,model,color_hue,run_state,
        (SELECT SUM(CASE WHEN r.status IN ('completed','stopped','error') AND r.ended_at>=r.started_at THEN r.ended_at-r.started_at
            WHEN r.status='open' AND r.ended_at IS NULL AND agents.run_state='running' AND r.started_at>=agents.run_started_at AND r.started_at<=? THEN ?-r.started_at END)
            FROM agent_runs r WHERE r.agent_id=agents.id) AS duration_ms,
        (SELECT MAX(e.ts) FROM events e WHERE e.agent_id=agents.id AND e.type='assistant') AS last_reply_at
        FROM agents WHERE parent_id = ? AND visibility = 'team' AND archived_at IS NULL ORDER BY created_at ASC`,params:[now,now,parentId]});
    const finite=(value:unknown):number|null=>value==null||!Number.isFinite(Number(value))||Number(value)<0?null:Number(value);
    return Promise.all(children.map(async row=>{
        const details=await ctx.fns.agent.contextDetails({agentId:String(row.id)});
        const input=details.usage.inputTokens,output=details.usage.outputTokens;
        const model=String(row.model??'');
        return {id:String(row.id),title:String(row.title??''),icon:await ctx.fns.frontendBridge.iconData({icon:row.icon,model:row.model}),colorHue:row.color_hue==null?null:Number(row.color_hue),runState:String(row.run_state??'idle'),
            tokens:(details.coverage?.tokenRequests??0)>0&&input!=null&&output!=null?finite(input+output):null,
            durationMs:finite(row.duration_ms),modelLabel:model.slice(model.lastIndexOf(':')+1),lastReplyAt:finite(row.last_reply_at)};
    }));
    };
    const [children,siblings]=await Promise.all([loadChildren(agentId),parent?loadChildren(parent.id):Promise.resolve([])]);
    return reply({agentId,title:String(rows[0].title??''),parent,children,siblings,csrfToken:await ctx.fns.auth.csrfToken({req})});
}
