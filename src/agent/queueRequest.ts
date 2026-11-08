/**
 * Handle durable next-turn queue reads and revision-guarded writes
 *
 * Authenticated same-origin queue API. Keeps pending work outside messages and serializes mutations with promotion. Stops retain queued items without scheduling.
 * @param opts.req HTTP request with authenticated session.
 * @param opts.params Agent id and optional queueId and action.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** HTTP request with authenticated session. */
        req: Request;
        /** Agent id and optional queueId and action. */
        params: Record<string,string>;
    },
): Promise<Response> {
    const {req,params}=opts; const id=params.id!; const url=new URL(req.url);
    const respond=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
    if(!(session as Session & {user?:{id:string}})?.user) return respond({error:'unauthorized'},401);
    if(req.method!=='GET' && (req.headers.get('origin')!==await ctx.fns.http.publicOrigin({req}) || req.headers.get('sec-fetch-site')==='cross-site')) return respond({error:'cross_origin'},403);
    const [a]=await ctx.fns.procs.db.select({sql:'SELECT id,archived_at,parent_id FROM agents WHERE id=?',params:[id]});
    if(!a) return respond({error:'not_found'},404);
    if(req.method==='GET') {const rows=await ctx.fns.procs.db.select({sql:"SELECT id,sequence,text,version,status,created_at,COALESCE((SELECT jsonb_agg(f - 'data') FROM jsonb_array_elements(files) f),'[]'::jsonb) AS files FROM agent_turn_queue WHERE agent_id=? AND status='pending' ORDER BY sequence",params:[id]}); return respond({items:rows.map(r=>({id:r.id,sequence:Number(r.sequence),text:r.text,version:Number(r.version),status:r.status,createdAt:Number(r.created_at),files:(typeof r.files==='string'?JSON.parse(r.files):r.files).map((f:{name:string;type:string;size:number})=>({name:f.name,type:f.type,size:f.size}))}))});}
    if(a.archived_at!=null) return respond({error:'archived'},409); if(a.parent_id) return respond({error:'read_only'},403);
    try {
    if(params.action==='steer'){const body=await req.json() as {version:number}; if(!body||!Number.isSafeInteger(body.version)||body.version<1)return respond({error:'invalid_version'},400); return await ctx.fns.agent.promoteQueuedTurn({agentId:id,queueId:params.queueId,version:body.version})??respond({error:'not_found'},404);}
    let text='',requestId='',fingerprint='',version=0; const files:Array<{name:string;type:string;size:number;data:string}>=[];
    if(req.method==='POST'){const form=await req.formData();text=String(form.get('text')??'').trim();requestId=(req.headers.get('idempotency-key')||String(form.get('requestId')??'')).trim();const values=form.getAll('files').filter(v=>typeof v!=='string') as File[];if(!requestId||requestId.length>200||text.length>200000||(!text&&!values.length)||values.length>10||values.some(f=>f.size>41943040)||values.reduce((n,f)=>n+f.size,0)>83886080)return respond({error:'invalid_submission'},400);for(const f of values)files.push({name:f.name,type:f.type,size:f.size,data:Buffer.from(await f.arrayBuffer()).toString('base64')});fingerprint=new Bun.CryptoHasher('sha256').update(JSON.stringify({text,files})).digest('hex');}
    else if(req.method==='PATCH'){const b=await req.json() as {text:string;version:number};if(!b||typeof b.text!=='string'||b.text.length>200000)return respond({error:'invalid_text'},400);text=b.text.trim();version=b.version;}
    else if(req.method==='DELETE')version=Number(url.searchParams.get('version'));else return respond({error:'method_not_allowed'},405);
    if(req.method!=='POST'&&(!Number.isSafeInteger(version)||version<1))return respond({error:'invalid_version'},400);
    const result=await ctx.fns.procs.db.transaction({fn:async()=>{
    const [locked]=await ctx.fns.procs.db.select({sql:'SELECT id,archived_at,parent_id,run_state,stopped_at FROM agents WHERE id=? FOR UPDATE',params:[id]});if(!locked)throw new Error('not_found');if(locked.archived_at!=null)throw new Error('archived');if(locked.parent_id)throw new Error('read_only');
    if(req.method==='POST'){const [prior]=await ctx.fns.procs.db.select({sql:'SELECT id,version,fingerprint FROM agent_turn_queue WHERE agent_id=? AND request_id=?',params:[id,requestId]});if(prior){if(prior.fingerprint!==fingerprint)throw new Error('idempotency_conflict');return {ok:true,queueId:prior.id,version:Number(prior.version),duplicate:true};}const queueId=crypto.randomUUID();await ctx.fns.procs.db.run({sql:'INSERT INTO agent_turn_queue(id,agent_id,request_id,fingerprint,text,files,created_at) VALUES(?,?,?,?,?,?::jsonb,?)',params:[queueId,id,requestId,fingerprint,text,JSON.stringify(files),Date.now()]});if(locked.run_state==='idle'&&locked.stopped_at==null)await ctx.fns.procs.db.run({sql:'UPDATE agents SET next_run_at=COALESCE(next_run_at,?) WHERE id=?',params:[Date.now(),id]});return {ok:true,queueId,version:1};}
    const [q]=await ctx.fns.procs.db.select({sql:'SELECT * FROM agent_turn_queue WHERE agent_id=? AND id=? FOR UPDATE',params:[id,params.queueId]});if(!q)throw new Error('not_found');if(q.status!=='pending'||Number(q.version)!==version)throw new Error('stale');if(req.method==='PATCH'&&!text&&(typeof q.files==='string'?JSON.parse(q.files):q.files).length===0)throw new Error('empty');await ctx.fns.procs.db.run({sql:req.method==='DELETE'?"UPDATE agent_turn_queue SET status='removed',files='[]'::jsonb,version=version+1 WHERE id=?":"UPDATE agent_turn_queue SET text=?,version=version+1 WHERE id=?",params:req.method==='DELETE'?[q.id]:[text,q.id]});return {ok:true,queueId:q.id,version:version+1};
    }});ctx.fns.agent.wakeWorker({});ctx.fns.events.emitAgentsChanged({agentId:id,reason:'turn-queue'});return respond(result);
    }catch(e){const m=e instanceof Error?e.message:String(e);if(['not_found','archived','read_only','idempotency_conflict','stale','empty'].includes(m))return respond({error:m},m==='not_found'?404:m==='read_only'?403:409);if(e instanceof SyntaxError||e instanceof TypeError)return respond({error:'invalid_request'},400);throw e;}
}
