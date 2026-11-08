/**
 * List mounted plugins and browse the plugin catalogue for the UI Lab Plugins page
 *
 * Use for the React "Plugins" screen. GET returns every mounted plugin (name, label, description, Phosphor icon, version, source layer, namespaces, function and route counts, skill and settings availability) plus a cookie-bound CSRF token. GET ?plugin=<name> returns one mounted plugin's detail card: SKILL.md overview, live functions with signatures, declared settings (secret values never included) and secret presence. GET ?market=1&q=<text> searches every registered plugin provider (at most 20 items each) and marks already mounted ones. Market items carry their pinned provider selection and whether the provider supports reviewed activation. POST accepts one JSON action — reload, optionally for an exact mounted plugin, or review with a provider selection, which opens Hyper's preview-only plugins.startReview agent for install and returns its id — after owner, same-origin, CSRF, content-type and size checks. Activation still requires the review agent's separate human confirmation.
 * @param opts.req Authenticated GET, or owner CSRF-protected JSON POST with action reload and optional name, or action review with a provider selection.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Authenticated GET, or owner CSRF-protected JSON POST with action reload and optional name, or action review with a provider selection. */
        req: Request;
    },
): Promise<Response> {
    const headers={'Cache-Control':'no-store','Vary':'Cookie'};
    const reply=(body:object,status=200)=>Response.json(body,{status,headers});
    const user=(session as Session & {user?:{id:string;role?:string}})?.user;
    if(!user)return reply({error:'Unauthorized'},401);
    const req=opts.req;
    if(!['GET','POST'].includes(req.method))return new Response(null,{status:405,headers:{...headers,Allow:'GET, POST'}});
    const mounted=await ctx.fns.plugins.list({}) as Array<{name:string;label?:string;description?:string;namespaces:string[];functions:number;routes:number;path:string;hasSkill:boolean;source?:string}>;
    if(req.method==='GET'){
        const url=new URL(req.url);
        try{
            const detailName=url.searchParams.get('plugin');
            if(detailName!=null){
                const p=mounted.find(m=>m.name===detailName);
                if(!p)return reply({error:'Plugin not found'},404);
                const read=await ctx.fns.plugins.read({name:p.name,maxChars:40000,includeFunctions:false}) as {overview?:{markdown?:string;truncated?:boolean}|null;domains?:string[]};
                const fns=await ctx.fns.plugins.functions({name:p.name});
                let config:types.plugins.ConfigurationResult|null=null;try{config=await ctx.fns.plugins.configuration({name:p.name});}catch{}
                return reply({plugin:{
                    name:p.name,label:p.label||p.name,description:p.description||'',source:p.source??'official',namespaces:p.namespaces,routes:p.routes,
                    domains:Array.isArray(read.domains)?read.domains.slice(0,50):[],
                    overview:typeof read.overview?.markdown==='string'?read.overview.markdown:null,overviewTruncated:!!read.overview?.truncated,
                    functions:fns.slice(0,500).map(f=>({name:f.name,summary:f.summary,signature:f.signature.slice(0,4000),returnType:f.returnType.slice(0,1000)})),
                    settings:(config?.settings??[]).map(s=>({key:s.key,title:s.descriptor.title??s.key,description:s.descriptor.description??'',type:s.descriptor.type,secret:s.secret,configured:s.configured,source:s.source,value:s.secret?null:(s.currentValue??null)})),
                    secrets:(config?.secrets??[]).map(s=>({name:s.name,title:s.title??s.name,description:s.description??'',required:!!s.required,configured:s.configured})),
                }});
            }
            if(url.searchParams.get('market')==='1'){
                const q=(url.searchParams.get('q')??'').slice(0,200);
                const providers=await ctx.fns.plugins.providers({});
                const names=new Set(mounted.map(p=>p.name));
                const sections=await Promise.all(providers.map(async p=>{
                    try{const r=await ctx.fns.plugins.dispatch({provider:p.id,operation:'search',args:{q,limit:20}}) as {items:types.plugins.ProviderItem[];errors:string[]};
                        return {provider:p.id,label:p.label,errors:r.errors.slice(0,5),items:r.items.slice(0,20).map(i=>({name:i.selection.name,label:i.label??i.selection.name,description:i.description??'',icon:i.icon??null,version:i.version??null,mounted:names.has(i.selection.name),selection:i.selection,reviewable:!!p.handlers?.materialize}))};}
                    catch{return {provider:p.id,label:p.label,errors:['Provider unavailable'],items:[]};}
                }));
                return reply({sections});
            }
            const plugins=await Promise.all(mounted.map(async p=>{
                let meta:any={};try{meta=await ctx.fns.plugins.readMetadata({path:p.path+'/package.json'});}catch{}
                const procs=meta?.procs&&typeof meta.procs==='object'?meta.procs:{};
                const config=procs.configuration;
                return {name:p.name,label:p.label||procs.label||p.name,description:p.description||procs.description||'',icon:typeof procs.icon==='string'?procs.icon:null,version:typeof meta.version==='string'?meta.version:null,source:p.source??'official',namespaces:p.namespaces,functions:p.functions,routes:p.routes,hasSkill:p.hasSkill,configurable:!!(config&&typeof config==='object'&&(Array.isArray(config.settings)?config.settings.length>0:true))};
            }));
            plugins.sort((a,b)=>a.label.localeCompare(b.label));
            return reply({plugins,csrfToken:await ctx.fns.auth.csrfToken({req})});
        }catch(error){return reply({error:error instanceof Error?error.message:'Could not load plugins'},500);}
    }
    if(user.role!=='owner')return reply({error:'Only owners can reload plugins'},403);
    if(req.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Same origin required'},403);
    if(!await ctx.fns.auth.verifyCsrf({req,token:req.headers.get('x-csrf-token')||''}))return reply({error:'Invalid request token'},403);
    if(req.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')return reply({error:'JSON body required'},415);
    const raw=await req.text();if(raw.length>4096)return reply({error:'Request too large'},413);
    let data:{action?:unknown;name?:unknown;selection?:unknown};try{data=JSON.parse(raw);}catch{return reply({error:'Invalid JSON'},400);}
    if(data&&typeof data==='object'&&data.action==='review'){
        if(Object.keys(data).some(k=>!['action','selection'].includes(k))||!data.selection||typeof data.selection!=='object'||Array.isArray(data.selection))return reply({error:'Invalid plugin selection'},400);
        try{const result=await ctx.fns.plugins.startReview({selection:data.selection as types.plugins.ProviderSelection,operation:'install'});return reply({ok:true,agentId:result.id});}
        catch(error){return reply({error:error instanceof Error?error.message:'Could not open plugin review'},400);}
    }
    if(!data||typeof data!=='object'||Object.keys(data).some(k=>!['action','name'].includes(k))||data.action!=='reload'||(data.name!==undefined&&typeof data.name!=='string'))return reply({error:'Invalid plugin action'},400);
    if(typeof data.name==='string'&&!mounted.some(p=>p.name===data.name))return reply({error:'Plugin not found'},404);
    try{await ctx.fns.plugins.reload(typeof data.name==='string'?{name:data.name}:{});return reply({ok:true});}
    catch(error){return reply({error:error instanceof Error?error.message:'Reload failed'},409);}
}
