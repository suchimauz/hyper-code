// Module-local state is discarded by hot reload; no session/context is retained after a flight.
type Summary = Awaited<ReturnType<typeof statsData>>;
type Entry = {value?: Summary; expires: number; retryAt: number; flight?: Promise<Summary>};
const summaries = new Map<string, Entry>();

/**
 * Read owner-scoped session activity and recorded token usage for the welcome screen
 *
 * Aggregate retained navigation-session records without changing application data. Supports all history or inclusive 7/30 local calendar days. Uses SQL grouped summaries and a bounded 45-second stale-while-revalidate cache. Refuses over 10000 sessions or 200000 source rows; unknown token usage remains null. Model attribution uses the current session model.
 * @param opts.range Inclusive local calendar date range, including today. @default all
 * @param opts.timezone IANA timezone used for calendar boundaries and peak-hour grouping. @default UTC
 */
export default async function statsData(
    ctx: Context,
    session: Session | null,
    opts: {
        /** Inclusive local calendar date range, including today. @default all */
        range?: "all" | "30d" | "7d";
        /** IANA timezone used for calendar boundaries and peak-hour grouping. @default UTC */
        timezone?: string;
    },
): Promise<{refreshing:boolean;range:string;timezone:string;asOf:string;startDate:string|null;sessions:number;messages:number;totalTokens:number|null;inputTokens:number|null;outputTokens:number|null;activeDays:number;peakHour:number|null;favoriteModel:string|null;models:Array<{model:string;messages:number;totalTokens:number|null;inputTokens:number|null;outputTokens:number|null}>;daily:Array<{date:string;messages:number;sessions:number;totalTokens:number|null;models:Array<{model:string;totalTokens:number|null}>}>;usageCoverage:{known:number;missing:number;historicalCompleteness:string};semantics:Record<string,string>}> {
    const user=(session as Session & {user?:{id:string}}|null)?.user;
    if(!user) throw new Error('Unauthorized');
    const range=opts.range??'all',timezone=opts.timezone??'UTC';
    if(!['all','30d','7d'].includes(range)||timezone.length>100)throw new Error('Invalid stats parameters');
    let formatter:Intl.DateTimeFormat;
    try{formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});}catch{throw new Error('Invalid stats parameters');}
    const now=Date.now(),asOf=new Date(now).toISOString();
    const parts=(ts:number)=>{const p=Object.fromEntries(formatter.formatToParts(ts).map(v=>[v.type,v.value]));return {date:p.year+'-'+p.month+'-'+p.day,hour:Number(p.hour)};};
    const today=parts(now).date;
    const start=range==='all'?null:new Date(Date.parse(today+'T00:00:00Z')-((range==='7d'?7:30)-1)*86400000).toISOString().slice(0,10);
    const users=await ctx.fns.auth.listUsers({});
    const firstOwner=users.find(u=>u.role==='owner')?.id??'';
    const scope="a.visibility='nav' AND (a.created_by=? OR (a.created_by IS NULL AND ?=?))";
    const ownerParams=[user.id,user.id,firstOwner];
    const resolvedTimezone=formatter.resolvedOptions().timeZone;
    const canonicalTimezone=['UTC','Etc/UTC','Etc/GMT','GMT'].includes(resolvedTimezone)?'UTC':resolvedTimezone;
    const key=JSON.stringify([user.id,firstOwner,range,canonicalTimezone,today]);
    let entry=summaries.get(key);
    if(!entry){
        // Never evict an in-flight calculation: cold callers must share it.
        if(summaries.size>=64){const victim=[...summaries].find(([,v])=>!v.flight);if(victim)summaries.delete(victim[0]);}
        if(summaries.size>=64)throw new Error('Stats capacity exceeded');
        entry={expires:0,retryAt:0};summaries.set(key,entry);
    }
    const cached=entry;
    // Preserve the requested alias in the public response while sharing canonical cache keys.
    const response=(value:Summary,refreshing:boolean):Summary=>({...value,timezone,refreshing});
    if(cached.value&&now<cached.expires)return response(cached.value,false);
    const calculate=async():Promise<Summary>=>{
    const lower=start?Date.parse(start+'T00:00:00Z')-86400000:0;
    const local=(column:string)=>`to_timestamp(${column}::double precision/1000) AT TIME ZONE ?`;
    const [agents,messages,events]=await Promise.all([
        ctx.fns.procs.db.select({sql:`WITH source AS (SELECT a.created_at FROM agents a WHERE ${scope} LIMIT 10001), localized AS (SELECT (${local('created_at')})::date::text AS date,created_at FROM source) SELECT date, count(*) AS n, (SELECT count(*) FROM source) AS source_count FROM localized WHERE created_at<=? GROUP BY date UNION ALL SELECT NULL,0,count(*) FROM source`,params:[...ownerParams,canonicalTimezone,now]}),
        ctx.fns.procs.db.select({sql:`WITH source AS (SELECT m.ts,a.model FROM messages m JOIN agents a ON a.id=m.agent_id WHERE ${scope} AND m.role IN ('user','assistant') AND COALESCE(m.excluded_from_cursor,0)=0 AND m.ts>=? AND m.ts<=? LIMIT 200001), localized AS (SELECT ${local('ts')} AS local,model FROM source) SELECT local::date::text AS date,extract(hour FROM local)::integer AS hour,model,count(*) AS n,(SELECT count(*) FROM source) AS source_count FROM localized GROUP BY date,hour,model UNION ALL SELECT NULL,NULL,NULL,0,count(*) FROM source`,params:[...ownerParams,lower,now,canonicalTimezone]}),
        ctx.fns.procs.db.select({sql:`WITH source AS (SELECT e.ts,e.payload,a.model FROM events e JOIN agents a ON a.id=e.agent_id WHERE ${scope} AND e.type='context_usage' AND e.ts>=? AND e.ts<=? LIMIT 200001), parsed AS MATERIALIZED (SELECT (${local('ts')})::date::text AS date,model,CASE WHEN payload IS JSON THEN payload::json ELSE NULL END AS p FROM source), tokens AS MATERIALIZED (SELECT date,model,CASE WHEN json_typeof(p->'usage'->'prompt_tokens')='number' THEN p->'usage'->>'prompt_tokens' END AS i,CASE WHEN json_typeof(p->'usage'->'completion_tokens')='number' THEN p->'usage'->>'completion_tokens' END AS o FROM parsed), numbers AS MATERIALIZED (SELECT date,model,CASE WHEN pg_input_is_valid(i,'double precision') THEN i::double precision END AS i,CASE WHEN pg_input_is_valid(o,'double precision') THEN o::double precision END AS o FROM tokens), valid AS (SELECT *, i>=0 AND o>=0 AS ok FROM numbers) SELECT date,model,count(*) FILTER(WHERE ok) AS known,count(*) FILTER(WHERE ok IS NOT TRUE) AS missing,sum(i) FILTER(WHERE ok) AS input,sum(o) FILTER(WHERE ok) AS output,sum(i+o) FILTER(WHERE ok) AS total,(SELECT count(*) FROM source) AS source_count FROM valid GROUP BY date,model UNION ALL SELECT NULL,NULL,0,0,NULL,NULL,NULL,count(*) FROM source`,params:[...ownerParams,lower,now,canonicalTimezone]})
    ]);
    if(agents.some(r=>Number(r.source_count)>10000)||messages.some(r=>Number(r.source_count)>200000)||events.some(r=>Number(r.source_count)>200000))throw new Error('Stats capacity exceeded');
    type Model={model:string;messages:number;totalTokens:number|null;inputTokens:number|null;outputTokens:number|null};
    type Day={date:string;messages:number;sessions:number;totalTokens:number|null;models:Array<{model:string;totalTokens:number|null}>};
    const models=new Map<string,Model>(),daily=new Map<string,Day>(),hours=new Array<number>(24).fill(0),active=new Set<string>();
    const names=await ctx.fns.llm.modelDisplayNames({models:[...new Set([...messages,...events].map(r=>String(r.model??'')).filter(Boolean))]});
    const model=(raw:string)=>{const name=names[raw]??(raw.slice(raw.lastIndexOf(':')+1)||raw);let m=models.get(name);if(!m){m={model:name,messages:0,totalTokens:null,inputTokens:null,outputTokens:null};models.set(name,m);}return m;};
    const day=(date:string)=>{let d=daily.get(date);if(!d){d={date,messages:0,sessions:0,totalTokens:null,models:[]};daily.set(date,d);}return d;};
    const within=(date:string)=>date<=today&&(!start||date>=start);
    let sessions=0,count=0,totalTokens:number|null=null,inputTokens:number|null=null,outputTokens:number|null=null,knownUsage=0,missingUsage=0;
    for(const a of agents){if(a.date&&within(a.date)){const n=Number(a.n);sessions+=n;day(a.date).sessions+=n;}}
    for(const m of messages){if(!m.date||!within(m.date))continue;const n=Number(m.n);count+=n;day(m.date).messages+=n;model(String(m.model)).messages+=n;hours[Number(m.hour)]=(hours[Number(m.hour)]??0)+n;active.add(m.date);}
    for(const e of events){if(!e.date||!within(e.date))continue;knownUsage+=Number(e.known);missingUsage+=Number(e.missing);if(!Number(e.known))continue;
        const input=Number(e.input),output=Number(e.output),total=Number(e.total);
        totalTokens=(totalTokens??0)+total;inputTokens=(inputTokens??0)+input;outputTokens=(outputTokens??0)+output;
        const m=model(String(e.model));m.totalTokens=(m.totalTokens??0)+total;m.inputTokens=(m.inputTokens??0)+input;m.outputTokens=(m.outputTokens??0)+output;
        const d=day(e.date);d.totalTokens=(d.totalTokens??0)+total;const dm=d.models.find(x=>x.model===m.model);if(dm)dm.totalTokens=(dm.totalTokens??0)+total;else d.models.push({model:m.model,totalTokens:total});
    }
    const ranked=[...models.values()].sort((a,b)=>b.messages-a.messages||a.model.localeCompare(b.model));
    return {refreshing:false,range,timezone,asOf,startDate:start,sessions,messages:count,totalTokens,inputTokens,outputTokens,activeDays:active.size,peakHour:count?hours.indexOf(Math.max(...hours)):null,favoriteModel:ranked[0]?.messages?ranked[0].model:null,models:ranked,daily:[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)),usageCoverage:{known:knownUsage,missing:missingUsage,historicalCompleteness:'unknown'},semantics:{scope:'owner nav sessions including archived; legacy null owner belongs to first owner',sessions:'created within calendar range',messages:'user and assistant records excluding cursor-excluded records',activeDays:'days with counted messages',tokens:'sum of available context_usage events only; absent usage is null, historical completeness unknown',models:'current session model, not historical request model',range:'inclusive local calendar days through asOf; all includes complete retained history'}};
    };
    if(!cached.flight&&now>=cached.retryAt){
        cached.flight=calculate().then(value=>{cached.value=value;cached.expires=Date.now()+45000;cached.retryAt=0;return value;}).catch(error=>{cached.retryAt=Date.now()+10000;if(!cached.value)summaries.delete(key);throw error;}).finally(()=>{cached.flight=undefined;});
        // A stale caller does not await this promise, so explicitly observe failures.
        void cached.flight.catch(()=>undefined);
    }
    if(cached.value)return response(cached.value,Boolean(cached.flight));
    return response(await cached.flight!,false);
}
