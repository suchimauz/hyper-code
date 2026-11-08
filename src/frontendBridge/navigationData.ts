/**
 * List native workspace chats and last assistant reply dates for the signed-in navigation sidebar
 *
 * Read exact native projects and both archived states with visitor-specific unread information. Include compact model names and durable requested/effective reasoning effort for chat tooltips matching ModelPicker. Resolve unique model/effort pairs using native cached capabilities only; never fetch catalogues or mutate agents. Does not expose transcript bodies.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<{projects: Array<{id:string;createdAt:number|null;title:string;dir:string;host:string;virtual:boolean;archived:boolean;runningCount:number;unreadCount:number;chats:Array<{id:string;createdAt:number|null;title:string;model:string;colorHue:number|null;modelLabel:string;effort:{requested:types.llm.ReasoningEffort;applied:types.llm.ReasoningEffort;label:string|null;downgraded:boolean}|null;runState:string;teamRunningCount:number;hasUnread:boolean;archived:boolean;pinned:boolean;pinnedAt:number|null;lastReplyAt:number|null;icon?:{src:string;custom:boolean}|null}>}>}> {
    if (!(session as Session & {user?: {id:string}})?.user) throw new Error('Unauthorized');
    // Native pins are viewer-specific; updated_at is the native state update time, not a separate first-pin timestamp.
    const viewerId=(session as Session & {user:{id:string}}).user.id;
    const pinRows=await ctx.fns.procs.db.select({sql:"SELECT agent_id,updated_at FROM user_agent_state WHERE user_id=? AND pinned",params:[viewerId]});
    const pins=new Map(pinRows.map(r=>[String(r.agent_id),Number(r.updated_at)]));
    const projects=await ctx.fns.projects.list({});
    const projectRows=projects.length?await ctx.fns.procs.db.select({sql:`SELECT id,created_at FROM projects WHERE id IN (${projects.map(()=>'?').join(',')})`,params:projects.map(p=>p.id)}):[];
    const projectCreated=new Map(projectRows.map(row=>[String(row.id),row.created_at==null?null:Number(row.created_at)]));
    const sessions=await ctx.fns.session.list({includeArchived:true});
    const summaries=new Map(sessions.map(s=>[s.id,s]));
    const dates=await ctx.fns.procs.db.select({sql:"SELECT m.agent_id,MAX(m.ts) AS ts FROM messages m JOIN agents a ON a.id=m.agent_id WHERE a.visibility='nav' AND m.role='assistant' AND m.content IS NOT NULL AND m.content <> '' AND (m.tool_calls IS NULL OR m.tool_calls='[]'::jsonb) GROUP BY m.agent_id"});
    const lastReply=new Map<string,number>(dates.map(r=>[String(r.agent_id),Number(r.ts)]));
    const iconRows=await ctx.fns.procs.db.select({sql:"SELECT id,icon,model,color_hue,reasoning_effort,created_at FROM agents WHERE visibility='nav'"});
    const icons=new Map(await Promise.all(iconRows.map(async row=>[String(row.id),await ctx.fns.frontendBridge.iconData({icon:row.icon,model:row.model})] as const)));
    // Native capability resolution is cache-only, including Hyper/OpenCode routes.
    // Share one resolution per distinct pair rather than repeating work for every chat.
    const efforts=new Map<string,Promise<{requested:types.llm.ReasoningEffort;applied:types.llm.ReasoningEffort;label:string|null;downgraded:boolean}>>();
    const labels:Record<types.llm.ReasoningEffort,string>={auto:'Default',off:'Off',minimal:'Minimal',low:'Low',medium:'Medium',high:'High',xhigh:'Max'};
    const metadata=new Map(await Promise.all(iconRows.map(async row=>{
        const model=String(row.model??'');
        const requested=String(row.reasoning_effort??'auto') as types.llm.ReasoningEffort;
        const key=JSON.stringify([model,requested]);
        if(!efforts.has(key)) efforts.set(key,ctx.fns.llm.resolveReasoningEffort({model,effort:requested}).then(resolved=>({requested:resolved.requested,applied:resolved.applied,label:resolved.mode==='none'?null:labels[resolved.requested==='auto'?'auto':resolved.applied],downgraded:resolved.downgraded})));
        return [String(row.id),{colorHue:row.color_hue==null?null:Number(row.color_hue),modelLabel:model.slice(model.lastIndexOf(':')+1),effort:await efforts.get(key)!,createdAt:row.created_at==null?null:Number(row.created_at)}] as const;
    })));
    const chatMetadata=(id:string,model:string)=>metadata.get(id)??{colorHue:null,modelLabel:String(model??'').slice(String(model??'').lastIndexOf(':')+1),effort:null,createdAt:null};
    const mapChat=(chat:types.projects.Chat)=>({id:chat.id,icon:icons.get(chat.id)??null,title:summaries.get(chat.id)?.title||chat.title,model:chat.model,...chatMetadata(chat.id,chat.model),runState:chat.runState,teamRunningCount:chat.teamRunningCount??0,hasUnread:chat.hasUnread,archived:chat.archived,pinned:pins.has(chat.id),pinnedAt:pins.get(chat.id)??null,lastReplyAt:lastReply.get(chat.id)??null});
    const result=[];
    for(const p of projects){const chats=[...await ctx.fns.projects.chats({projectId:p.id}),...await ctx.fns.projects.chats({projectId:p.id,archived:true})].map(mapChat).sort((a,b)=>(b.lastReplyAt??0)-(a.lastReplyAt??0)||a.id.localeCompare(b.id));result.push({id:p.id,createdAt:projectCreated.get(p.id)??null,title:p.title,dir:p.dir,host:p.host,virtual:p.virtual??false,archived:p.archived??false,runningCount:p.runningCount??0,unreadCount:p.unreadCount??0,chats});}
    const unassigned=await ctx.fns.procs.db.select({sql:"SELECT id,title,model,run_state,archived_at FROM agents WHERE visibility='nav' AND (workspace_dir IS NULL OR workspace_dir NOT LIKE '/%') ORDER BY created_at,id"});
    if(unassigned.length)result.push({id:'unassigned',createdAt:null,title:'Без проекта',dir:'',host:'',virtual:true,archived:false,runningCount:unassigned.filter(r=>r.run_state==='running'||r.run_state==='claimed').length,unreadCount:0,chats:unassigned.map(r=>({id:String(r.id),icon:icons.get(String(r.id))??null,title:summaries.get(String(r.id))?.title||String(r.title||r.id),model:String(r.model),...chatMetadata(String(r.id),String(r.model)),runState:String(r.run_state),teamRunningCount:0,hasUnread:!!summaries.get(String(r.id))?.unread,archived:r.archived_at!=null,pinned:pins.has(String(r.id)),pinnedAt:pins.get(String(r.id))??null,lastReplyAt:lastReply.get(String(r.id))??null})).sort((a,b)=>(b.lastReplyAt??0)-(a.lastReplyAt??0))});
    return {projects:result};
}
