/**
 * Read new-chat model defaults or create and submit one project chat exactly once
 *
 * Use for UI Lab drafts without an agent. Authenticated JSON or multipart POST binds a durable owner-scoped request key before native creation and message acceptance; interrupted creation fails closed; a durably bound and configured agent can retry native message acceptance with the same idempotency key, never creation. GET returns model choices and a cookie-bound CSRF token without creating an agent.
 * @param opts.req Authenticated GET defaults request or CSRF-protected POST with requestKey, projectId, optional title, workspaceDir (without projectId), createWorkspaceDir (explicit 1 authorizes directory creation), promptPreset IDs, systemPrompt, model, mascot (omitted or random keeps SQL DEFAULT; otherwise crab/deepy/whalegirl/desksprite/bitty/tmuxai/planet/rainbow-terminal-cat), text, and up to 10 files (40 MiB each, 80 MiB total).
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Authenticated GET defaults request or CSRF-protected POST with requestKey, projectId, optional title, workspaceDir (without projectId), createWorkspaceDir (explicit 1 authorizes directory creation), promptPreset IDs, systemPrompt, model, mascot (omitted or random keeps SQL DEFAULT; otherwise crab/deepy/whalegirl/desksprite/bitty/tmuxai/planet/rainbow-terminal-cat), text, and up to 10 files (40 MiB each, 80 MiB total). */
        req: Request;
    },
): Promise<Response> {
    const headers={'Cache-Control':'no-store','Vary':'Cookie'};
    const reply=(data:object,status=200)=>Response.json(data,{status,headers});
    if(!(session as Session & {user?:{id:string}})?.user)return reply({error:'Unauthorized'},401);
    const req=opts.req;
    if(!['GET','POST'].includes(req.method))return reply({error:'Method not allowed'},405);
    const owner=await ctx.fns.projects.principal({});
    if(req.method==='POST'&&!await ctx.fns.auth.verifyCsrf({req,token:req.headers.get('x-csrf-token')||''}))return reply({error:'Invalid request token'},403);
    const [groups,defaultModel,policy]=await Promise.all([ctx.fns.llm.listModels({}),ctx.fns.settings.modelDefault({}),ctx.fns.llm.modelPolicy({action:'list'})]);
    const canonical=(model:string)=>(model.includes(':')?model:'lmstudio:'+model).replace(/^(?!mauzcode\/)([^/:]+)\/default:/,'$1:');
    const disabled=new Set(policy.disabledModels.map(canonical));
    const models=await Promise.all(Object.entries(groups).flatMap(([provider,values])=>values.map(async model=>({provider,model,label:model.slice(model.lastIndexOf(':')+1),disabled:disabled.has(canonical(model)),icon:await ctx.fns.frontendBridge.iconData({model})}))));
    const enabledDefault=models.find(m=>!m.disabled&&m.model===defaultModel)?.model??models.find(m=>!m.disabled)?.model??'';
    const efforts=['auto','off','minimal','low','medium','high','xhigh'];
    if(req.method==='GET'){
        const url=new URL(req.url),model=url.searchParams.get('model')||enabledDefault,requested=url.searchParams.get('effort')||'auto';
        if(!models.some(m=>m.model===model&&!m.disabled)||!efforts.includes(requested))return reply({error:'Invalid model or effort'},400);
        const [profile,resolved]=await Promise.all([ctx.fns.llm.reasoningCapabilities({model}),ctx.fns.llm.resolveReasoningEffort({model,effort:requested as types.llm.ReasoningEffort})]);
        return reply({promptPresets:await ctx.fns.agent.listPromptPresets({}),version:1,model,label:model.slice(model.lastIndexOf(':')+1),icon:await ctx.fns.frontendBridge.iconData({model}),defaultModel:enabledDefault,models,effort:{requested,applied:resolved.applied,supported:profile.supported,defaultEffort:profile.defaultEffort,mode:profile.mode,downgraded:resolved.downgraded},csrfToken:await ctx.fns.auth.csrfToken({req})});
    }
    const contentType=req.headers.get('content-type')?.split(';')[0]?.trim();
    let data:{requestKey?:string;projectId?:string;model?:string;effort?:string;mascot?:string;text?:string;title?:string;workspaceDir?:string;createWorkspaceDir?:string;promptPreset?:string[];systemPrompt?:string};
    let files:File[]=[];
    if(contentType==='multipart/form-data'){
        // Reject oversized declared bodies before parsing; actual file sizes are checked below.
        if(Number(req.headers.get('content-length'))>82*1024*1024)return reply({error:'Request too large'},413);
        try{
            const form=await req.formData();
            const fields:Record<string,string>={};
            for(const [name,value] of form.entries()){
                if(name==='files'&&value instanceof File){files.push(value);continue;}
                if(!['requestKey','projectId','model','effort','mascot','text','title','workspaceDir','createWorkspaceDir','promptPreset','systemPrompt'].includes(name)||typeof value!=='string'||Object.hasOwn(fields,name))return reply({error:'Invalid multipart field'},400);
                fields[name]=value;
            }
            data={...fields, ...(fields.promptPreset ? {promptPreset:JSON.parse(fields.promptPreset)} : {})};
        }catch{return reply({error:'Invalid multipart body'},400);}
    }else if(contentType==='application/json'){
        const raw=await req.text();if(raw.length>100000)return reply({error:'Request too large'},413);
        try{data=JSON.parse(raw);}catch{return reply({error:'Invalid JSON'},400);}
    }else return reply({error:'JSON or multipart body required'},415);
    if(files.length>10||files.some(file=>file.size>40*1024*1024)||files.reduce((sum,file)=>sum+file.size,0)>80*1024*1024)return reply({error:'Не более 10 файлов, до 40 МБ каждый и 80 МБ суммарно.'},413);
    files=files.filter(file=>file.size>0);
    if(!data||Object.keys(data).some(k=>!['requestKey','projectId','model','effort','mascot','text','title','workspaceDir','createWorkspaceDir','promptPreset','systemPrompt'].includes(k))||typeof data.requestKey!=='string'||! /^[A-Za-z0-9_-]{16,128}$/.test(data.requestKey)||typeof data.projectId!=='string'||(!data.projectId&&!data.workspaceDir)||typeof data.text!=='string'||(!data.text.trim()&&!files.length)||data.text.length>64000||(data.model!==undefined&&typeof data.model!=='string'))return reply({error:'Invalid draft submission'},400);
    if((['title','workspaceDir','createWorkspaceDir','systemPrompt'] as const).some(k=>data[k]!==undefined&&typeof data[k]!=='string')||(data.promptPreset!==undefined&&(!Array.isArray(data.promptPreset)||data.promptPreset.some(id=>typeof id!=='string'))))return reply({error:'Invalid advanced fields'},400);
    if(data.projectId&&data.workspaceDir)return reply({error:'Choose either a project or a custom local workspace'},400);
    const advanced={title:data.title||'',workspaceDir:data.workspaceDir||'',createWorkspaceDir:data.createWorkspaceDir||'',promptPreset:data.promptPreset||[],systemPrompt:data.systemPrompt||''};
    const hasAdvanced=Object.values(advanced).some(value=>value.length>0);
    const mascots=['crab','deepy','whalegirl','desksprite','bitty','tmuxai','planet','rainbow-terminal-cat'];
    if(data.mascot!==undefined&&(typeof data.mascot!=='string'||(data.mascot!=='random'&&!mascots.includes(data.mascot))))return reply({error:'Invalid mascot'},400);
    const mascot=data.mascot==='random'?undefined:data.mascot;
    const digests=await Promise.all(files.map(async file=>({name:file.name,type:file.type,hash:new Bun.CryptoHasher('sha256').update(await file.arrayBuffer()).digest('hex')})));
    // Preserve existing default/random fingerprints; explicit mascot and file bytes bind retries.
    const fingerprint=new Bun.CryptoHasher('sha256').update(JSON.stringify([data.projectId,data.model??null,data.effort??'auto',data.text,...(files.length?[digests]:[]),...(mascot?[{mascot}]:[]),...(hasAdvanced?[advanced]:[])])).digest('hex');
    const messageRequest=()=>{
        if(!files.length)return new Request(req.url,{method:'POST',headers:{'content-type':'text/plain','idempotency-key':data.requestKey!},body:data.text});
        const body=new FormData();body.set('text',data.text!);
        files.forEach(file=>body.append('files',file,file.name));
        return new Request(req.url,{method:'POST',headers:{'idempotency-key':data.requestKey!},body});
    };
    const key='mauzcode-ui-new-session:'+owner+':'+data.requestKey;
    type Claim={fingerprint:string;status:string;agentId?:string;projectId:string;ready?:boolean};
    const read=async()=>{const [row]=await ctx.fns.procs.db.select({sql:'SELECT value FROM kv WHERE key=?',params:[key]});return row?JSON.parse(row.value) as Claim:null;};
    const replay=(claim:Claim)=>claim.fingerprint!==fingerprint?reply({error:'Request key already used for different input'},409):claim.status==='sent'?reply({agentId:claim.agentId,projectId:claim.projectId,status:'sent'},200):reply({error:claim.status==='failed'?'First submission interrupted; inspect the chat before retrying.':'First submission in progress; retry the same request key.',status:claim.status,agentId:claim.agentId??null,projectId:claim.projectId},409);
    const prior=await read();
    if(prior){
        if(prior.fingerprint!==fingerprint||prior.status==='sent'||!prior.agentId||!prior.ready)return replay(prior);
        // Native acceptMessage serializes and deduplicates this exact agent/key/payload.
        // ready is persisted only after agent binding, mascot and reasoning configuration.
        try{
            const message=messageRequest();
            const accepted=await ctx.fns.agent.acceptMessage({req:message,params:{id:prior.agentId}});
            if(accepted.status>=400)return reply({error:'Message retry failed; inspect the existing chat.',status:prior.status,agentId:prior.agentId,projectId:prior.projectId},409);
            prior.status='sent';
            await ctx.fns.procs.db.run({sql:'UPDATE kv SET value=? WHERE key=?',params:[JSON.stringify(prior),key]});
            return replay(prior);
        }catch(error){console.error('UI first submission recovery failed',error);return reply({error:'Unable to confirm message; retry the same request key.',status:prior.status,agentId:prior.agentId,projectId:prior.projectId},409);}
    }
    const project=data.projectId?await ctx.fns.projects.get({projectId:data.projectId}):null;if(data.projectId&&!project)return reply({error:'Project not found'},404);
    if(!data.projectId&&advanced.createWorkspaceDir!=='1'){try{await ctx.fns.workspace.normalize({dir:advanced.workspaceDir,create:false});}catch(error){return reply({error:String(error instanceof Error?error.message:error)},422);}}
    const model=data.model||enabledDefault;if(!models.some(m=>m.model===model&&!m.disabled))return reply({error:'Model unavailable'},400);
    if(data.effort!==undefined&&(typeof data.effort!=='string'||!efforts.includes(data.effort)))return reply({error:'Invalid effort'},400);
    const effort=(data.effort??'auto') as types.llm.ReasoningEffort;
    const profile=await ctx.fns.llm.reasoningCapabilities({model});
    if(effort!=='auto'&&!profile.supported.includes(effort))return reply({error:'Effort unsupported for model'},400);
    const claim:Claim={fingerprint,status:'sending',projectId:data.projectId};
    const inserted=await ctx.fns.procs.db.select({sql:'INSERT INTO kv (key,value) VALUES (?,?) ON CONFLICT (key) DO NOTHING RETURNING key',params:[key,JSON.stringify(claim)]});
    if(!inserted.length){const existing=await read();return existing?replay(existing):reply({error:'Request state unavailable'},409);}
    const save=()=>ctx.fns.procs.db.run({sql:'UPDATE kv SET value=? WHERE key=?',params:[JSON.stringify(claim),key]});
    try{
     const created=await ctx.fns.agent.createFromValues({...advanced,projectId:data.projectId,model});
     if(!created.agent)throw new Error(created.error||'Agent creation failed');
     claim.agentId=created.agent.id;await save();
     // Creation persists SQL DEFAULT; override only a newly created agent before its first message.
     if(mascot)await ctx.fns.procs.db.run({sql:'UPDATE agents SET mascot=? WHERE id=?',params:[mascot,claim.agentId!]});
     await ctx.fns.agent.setReasoningEffort({id:claim.agentId!,effort});
     claim.ready=true;await save();
     const message=messageRequest();
     const response=await ctx.fns.agent.acceptMessage({req:message,params:{id:claim.agentId!}});
     if(response.status>=400)throw new Error('Message acceptance failed');
     claim.status='sent';await save();
     return reply({agentId:claim.agentId,projectId:claim.projectId,status:'sent'},201);
    }catch(error){claim.status='failed';await save();console.error('UI first submission failed',error);return replay(claim);}
}
