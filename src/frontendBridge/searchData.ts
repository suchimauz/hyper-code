/**
 * Return structured native menu tabs and search results for the signed-in UI visitor
 *
 * Read the native layout and widget outputs without parsing HTML. HTML-only widgets are unsupported. Never expose SVG or executable actions.
 * @param opts.q Search text; empty selects native menu widgets.
 * @param opts.tab Native tab ID; unknown selects the first tab.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Search text; empty selects native menu widgets. */
        q?: string;
        /** Native tab ID; unknown selects the first tab. */
        tab?: string;
    },
): Promise<object> {
    if (!(session as Session & {user?: {id:string}})?.user) throw new Error('Unauthorized');
    const {tabs}=await ctx.fns.nav.tabs({});
    const tab=tabs.find(t=>t.id===opts.tab)??tabs[0];
    const sessions=await ctx.fns.session.list({includeArchived:true});
    const titles=new Map(sessions.map(s=>[s.id,s.title]));
    const clean=(items: types.nav.Item[] = [])=>items.map(i=>({id:i.id,label:(i.id?.startsWith('agent:')?titles.get(i.id.slice(6)):undefined)||i.label,href:/^\/(?:a\/[A-Za-z0-9_-]+|agent\/[A-Za-z0-9_-]+|projects\/(?:view|archive)|files|search|settings(?:\/declared)?|llms|auth\/users|plugins|shared-agents|controlPlane|sshInstance|functions|knowledge|architectureMap|gcal\/|news(?:\/reader)?|tasks|discovery|gaps|rss|hackernews|substack|inbox|whisper|autotext|cron|update|telemetry)(?:\?[^#]*)?$/.test(i.href) && !/[\\\r\n]/.test(i.href) ? i.href : null,hint:i.hint,detail:i.detail,model:i.model,active:i.active,unread:i.unread,unreadCount:i.unreadCount,owner:i.owner,group:i.group}));
    const base={activeTab:tab?.id??null,tabs:tabs.map(t=>({id:t.id,title:t.title}))};
    if(opts.q?.trim()) { const result=await ctx.fns.nav.searchAll({q:opts.q.trim(),tab:tab?.id,inlineMs:0});return {...base,mode:'search',widgets:[],groups:result.groups.map(g=>({id:g.id,title:g.title,items:clean(g.items),...(g.error?{error:'Unavailable'}:{})}))}; }
    const registry=(ctx.state as typeof ctx.state & {nav?:{widgets?:Record<string,types.nav.Widget>}}).nav?.widgets??{};
    const widgets=await Promise.all((tab?.widgets??[]).map(async p=>{
    const def=registry[p.widget];const base={id:p.id,widget:p.widget,title:def?.title??p.widget,size:p.size,status:'ok',items:clean(),sections:[] as {title?:string;collapsed?:boolean;count?:number;items:ReturnType<typeof clean>}[],nativeHref:'/'};
    if(!def)return {...base,status:'unavailable'};
    const config:Record<string,unknown>={};for(const [k,v]of Object.entries(def.config??{}))if(v.default!==undefined)config[k]=v.default;Object.assign(config,p.config??{});
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{const out=await Promise.race([Promise.resolve().then(()=>def.render(ctx,session,{size:p.size??'M',config})),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),2500)})]);
    if(typeof out==='string')return {...base,status:'unsupported'};
    const data:types.nav.WidgetOutput=Array.isArray(out)?{items:out}:out??{};
    return {...base,status:data.html||data.sections?.some(s=>s.html)?'unsupported':'ok',items:clean(data.items),sections:(data.sections??[]).map(s=>({title:s.title,collapsed:s.collapsed,count:s.count,items:clean(s.items)}))};
    }catch{return {...base,status:'unavailable'};}finally{if(timer)clearTimeout(timer);}
    }));return {...base,mode:'home',groups:[],widgets};
}
