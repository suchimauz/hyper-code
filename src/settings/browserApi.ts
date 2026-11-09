/**
 * Serve owner-only settings snapshots and validated settings mutations for the React settings pages
 *
 * Use from settings HTTP routes. Returns secret-free declared settings and provider status, enforces owner identity and cookie-bound CSRF for JSON writes, and never echoes credential values or exception details.
 * @param opts.req Incoming settings GET or JSON POST request.
 * @param opts.section Settings page whose snapshot or mutations are requested.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming settings GET or JSON POST request. */
        req: Request;
        /** Settings page whose snapshot or mutations are requested. */
        section: "overview" | "declared";
    },
): Promise<Response> {
    const req=opts.req;
    const reply=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie'}});
    const who = await ctx.fns.auth.currentUser({req:opts.req});
    const { user } = who;
    if (who.required && !user && !who.legacy)return reply({error:'Unauthorized'},401);
    if (user && user.role !== 'owner')return reply({error:'Owner access required'},403);
    if(req.method==='GET'){
     if(opts.section==='declared'){
     const items=await ctx.fns.settings.declared({});
     return reply({items:items.map(i=>({module:i.module,key:i.key,source:i.source,path:i.path,type:i.descriptor.type,title:i.descriptor.title,description:i.descriptor.description,options:i.descriptor.options,min:i.descriptor.min,max:i.descriptor.max,env:i.descriptor.env,...(i.descriptor.type==='secret'?{configured:!!i.currentValue}:{value:i.currentValue,defaultValue:i.descriptor.default})}))});
     }
     const snapshot=await ctx.fns.settings.status({});
     const status={openai:snapshot.openai,anthropic:snapshot.anthropic,kimi:snapshot.kimi,groq:snapshot.groq,openrouter:snapshot.openrouter,kimiCoding:snapshot.kimiCoding,codex:snapshot.codex};
     const flows:Record<string,object>={};
     for(const provider of ['kimi','codex']){const f=(ctx.state as any).settings?.[provider];const url=f?.verificationUriComplete??f?.verificationUri;let safeUrl:string|undefined;try{if(url&&new URL(url).protocol==='https:')safeUrl=url;}catch{/* Invalid provider URL is omitted. */} flows[provider]={status:f?.status??'idle',...(f?.status==='pending'?{url:safeUrl,userCode:f.userCode}:{}),...(f?.status==='failed'?{error:'Authorization failed. Please try again.'}:{})};}
     return reply({status,flows});
    }
    if(req.method!=='POST')return reply({error:'Method not allowed'},405);
    if(req.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Same origin required'},403);
    const origin=req.headers.get('origin');if(origin!==null&&origin!==await ctx.fns.http.publicOrigin({req}))return reply({error:'Same origin required'},403);
    if(!await ctx.fns.auth.verifyCsrf({req,token:req.headers.get('x-csrf-token')??''}))return reply({error:'Invalid request token'},403);
    if(req.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'JSON required'},415);
    const raw=await req.text();if(raw.length>65536)return reply({error:'Request too large'},413);
    let data:Record<string,any>;try{data=JSON.parse(raw);}catch{return reply({error:'Invalid JSON'},400);}
    if(!data||typeof data!=='object'||Array.isArray(data))return reply({error:'Invalid request'},400);
    try{
    if(opts.section==='declared'){
     const registry=(ctx.state as any).settings?.registry as Map<string,any>|undefined;
     const name=typeof data.name==='string'?data.name:'';const d=registry?.get(name);if(!d)return reply({error:'Unknown setting'},400);
     const dot=name.indexOf('.');const target={module:name.slice(0,dot),key:name.slice(dot+1),scopeType:'global'};
     if((await ctx.fns.settings.files({})).values[name])return reply({error:'Setting is fixed by an instance file'},409);
     if(data.action==='reset'){await ctx.fns.settings.remove(target);return reply({ok:true});}
     if(data.action!=='save')return reply({error:'Unknown action'},400);
     const v=data.value;
     if(d.type==='secret'&&v==='')return reply({ok:true});
     const valid=d.type==='number'?typeof v==='number'&&Number.isFinite(v)&&(d.min==null||v>=d.min)&&(d.max==null||v<=d.max):d.type==='boolean'?typeof v==='boolean':d.type==='enum'?Array.isArray(d.options)&&d.options.includes(v):typeof v==='string';
     if(!valid)return reply({error:'Invalid setting value'},400);
     await ctx.fns.settings.set({...target,value:v,isSecret:d.type==='secret'});
    }else{
     if(data.action==='env'){
     if(!['OPENAI_API_KEY','ANTHROPIC_API_KEY','KIMI_API_KEY','GROQ_API_KEY','OPENROUTER_API_KEY'].includes(data.key)||typeof data.value!=='string'||!data.value.trim()||/[\r\n\0]/.test(data.value))return reply({error:'Provider key and nonempty value required'},400);
     await ctx.fns.settings.saveEnv({entries:{[data.key]:data.value}});
     }else if(data.action==='kimi-login')await ctx.fns.settings.startKimiLogin({});
     else if(data.action==='kimi-logout')await ctx.fns.settings.logoutKimi({});
     else if(data.action==='codex-login')await ctx.fns.settings.startCodexLogin({});
     else if(data.action==='codex-logout')await ctx.fns.settings.logoutCodex({});
     else return reply({error:'Unknown action'},400);
    }
    return reply({ok:true});
    }catch{return reply({error:'Settings operation failed. No credential details are returned.'},400);}
}
