/**
 * List and manage owner LLM subscription accounts for the UI Lab settings screen
 *
 * Use for the React Settings → LLM Connections tab. GET returns secret-free account rows (provider, slot, label, quota windows, reconnect state), safe in-progress login hints (authorization link, device code), trusted SSH instance names and a cookie-bound CSRF token. POST accepts one JSON action after owner, same-origin, CSRF, content-type and size checks: login (start official Codex, Claude Code, Kimi Coding or Grok login locally or on an SSH instance), code (submit a Claude one-time code or SSH callback URL), cancel (stop a remote login), users (agents using an account) and remove (delete an account, requires confirmed:true). Local Claude supports CLI or managed OAuth; a saved proxy requires local OAuth and is immutable after creation. GET includes safe proxy choices and bindings. OAuth code/cancel use the exact pending flow. Never returns tokens or credentials.
 * @param opts.req Authenticated owner GET, or CSRF-protected JSON POST with action and its fields.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Authenticated owner GET, or CSRF-protected JSON POST with action and its fields. */
        req: Request;
    },
): Promise<Response> {
    const headers={'Cache-Control':'no-store','Vary':'Cookie'};
    const reply=(body:object,status=200)=>Response.json(body,{status,headers});
    const user=(session as Session & {user?:{id:string;role?:string}})?.user;
    if(!user)return reply({error:'Unauthorized'},401);
    const req=opts.req;
    if(!['GET','POST'].includes(req.method))return new Response(null,{status:405,headers:{...headers,Allow:'GET, POST'}});
    if(user.role!=='owner')return reply({error:'Only owners can manage LLM connections'},403);
    type Flow={id:string|null;provider:string;account:string;instance:string|null;status:string;verificationUri:string|null;userCode:string|null;needsCode:boolean;callbackSubmitted:boolean;error:string|null;diagnostics?:types.sshAccount.LoginFlow['diagnostics']};
    const flows=():Flow[]=>{
        const local=ctx.fns.llm.accountLoginStatus({}).map(f=>({id:f.id??null,provider:f.provider,account:f.account,instance:null,status:f.status,verificationUri:f.verificationUri,userCode:f.userCode,needsCode:f.needsCode,callbackSubmitted:false,error:f.error}));
        const remote=[...((ctx.state as {sshAccount?:{flows?:Map<string,types.sshAccount.LoginFlow>}}).sshAccount?.flows?.values()??[])]
            .filter(f=>!!f.instance&&f.status!=='connected'&&f.status!=='cancelled'&&f.expiresAt>Date.now()-600000)
            .map(f=>({id:f.id,provider:f.provider,account:f.account,instance:f.instance,status:f.status,verificationUri:f.verificationUri,userCode:f.userCode,needsCode:f.provider==='claude-code'&&f.status==='pending'&&!!f.verificationUri&&!f.callbackSubmission,callbackSubmitted:!!f.callbackSubmission,error:f.error,...(f.diagnostics?{diagnostics:{startedAt:f.diagnostics.startedAt,endedAt:f.diagnostics.endedAt,exitCode:f.diagnostics.exitCode,reason:f.diagnostics.reason,httpCode:f.diagnostics.httpCode,stages:f.diagnostics.stages.slice(0,4).map(s=>({phase:s.phase,startedAt:s.startedAt,endedAt:s.endedAt,exitCode:s.exitCode}))}}:{})}));
        return [...local,...remote];
    };
    if(req.method==='GET'){
        try{
            const [accounts,instances,proxies]=await Promise.all([ctx.fns.llm.listAccounts({}),ctx.fns.sshInstance.list({}).catch(()=>[]),ctx.fns.socksProxy.list({})]);
            const accountRows=await Promise.all(accounts.map(async a=>({...a,proxy:a.provider==="anthropic-oauth"?await ctx.fns.llm.accountProxy({provider:a.provider,account:a.account}):null})));
            const providers=[...new Set(['codex','claude-code','anthropic-oauth','kimi-coding','xai','opencode','zai-coding','minimax-coding',...accounts.map(a=>a.provider)])];
            const icons=Object.fromEntries(await Promise.all(providers.map(async p=>{try{return [p,await ctx.fns.frontendBridge.iconData({model:p+':x'})] as const}catch{return [p,null] as const}})));
            return reply({
                providerIcons:icons,
                proxies:proxies.map(p=>({id:p.id,name:p.name,host:p.host,port:p.port})),
                accounts:accountRows.map(a=>({proxy:a.proxy,provider:a.provider,account:a.account,label:a.label,source:a.source,sshInstance:(a as {sshInstance?:string|null}).sshInstance??null,available:a.available,needsReconnect:a.needsReconnect,usedPercent:a.usedPercent,resetsAt:a.resetsAt,windows:a.windows,planType:a.planType,parkedAgents:a.parkedAgents})),
                logins:flows(),
                instances:instances.filter(i=>!!i.pinnedHostKey).map(i=>i.name),
                csrfToken:await ctx.fns.auth.csrfToken({req}),
            });
        }catch(error){return reply({error:error instanceof Error?error.message:'Could not load LLM connections'},500);}
    }
    if(req.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Same origin required'},403);
    const origin=req.headers.get('origin');
    if(origin!==null&&origin!==await ctx.fns.http.publicOrigin({req}))return reply({error:'Same origin required'},403);
    if(!await ctx.fns.auth.verifyCsrf({req,token:req.headers.get('x-csrf-token')||''}))return reply({error:'Invalid request token'},403);
    if(req.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')return reply({error:'JSON body required'},415);
    const raw=await req.text();
    if(raw.length>8192)return reply({error:'Request too large'},413);
    let data:Record<string,unknown>;
    try{data=JSON.parse(raw);}catch{return reply({error:'Invalid JSON'},400);}
    if(!data||typeof data!=='object'||Array.isArray(data))return reply({error:'Invalid request'},400);
    const str=(k:string)=>typeof data[k]==='string'?(data[k] as string).trim():'';
    const provider=str('provider'),account=str('account'),instance=str('instance'),id=str('id');
    try{
        switch(data.action){
            case 'login':{
                if(provider!=='codex'&&provider!=='claude-code'&&provider!=='kimi-coding'&&provider!=='xai')return reply({error:'Unsupported provider'},400);
                if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(account)||account==='default')return reply({error:'Account name: 1–40 letters, digits, _ or -, not "default"'},400);
                const method=str("method")||"cli";
                const proxyId=str("proxyId");
                if(data.proxyId!==undefined&&data.proxyId!==null&&typeof data.proxyId!=="string")return reply({error:"Invalid proxy selection"},400);
                if(!["cli","oauth"].includes(method))return reply({error:"Unsupported login method"},400);
                if(proxyId&&(provider!=="claude-code"||instance||method!=="oauth"))return reply({error:"Proxy requires local Claude OAuth login"},400);
                if(method==="oauth"&&(provider!=="claude-code"||instance))return reply({error:"OAuth selection is only available for local Claude"},400);
                if(provider==="claude-code"&&!instance&&method==="oauth"){await ctx.fns.llm.startAnthropicOAuth({account,...(data.proxyId!==undefined?{proxyId:proxyId||null}:{})});return reply({id:null,message:"OAuth authorization started. The browser uses its own network."},201);}
                if(instance&&provider==='xai')return reply({error:'Grok does not support SSH login'},400);
                if(instance){
                    const flow=provider==='kimi-coding'?await ctx.fns.sshAccount.startKimiLogin({instance,account}):await ctx.fns.sshAccount.startLogin({instance,provider:provider as 'codex'|'claude-code',account});
                    return reply({id:flow.id,message:'Authorization started on the SSH instance.'},201);
                }
                if(provider==='kimi-coding'){const flow=await ctx.fns.sshAccount.startKimiLogin({account});return reply({id:flow.id,message:'Authorization started.'},201);}
                if(provider==='xai')await ctx.fns.llm.startXaiOAuth({account});
                else await ctx.fns.llm.startAccountLogin({provider:provider as 'codex'|'claude-code',account});
                return reply({id:null,message:'Authorization started.'},201);
            }
            case 'code':{
                const code=typeof data.code==='string'?data.code.trim():'';
                if(!code||code.length>4096)return reply({error:'Code required'},400);
                if(provider==="anthropic-oauth"){await ctx.fns.llm.completeAnthropicOAuth({input:code});return reply({message:"Claude OAuth account connected."});}
                if(id){
                    const flow=await ctx.fns.sshAccount.status({id});
                    if(flow.instance){await ctx.fns.sshAccount.submitCode({id,code});return reply({message:'Callback sent. Refresh status to see the CLI result.'});}
                }
                if(provider!=='claude-code'||!account)return reply({error:'Only Claude Code accepts a pasted code'},400);
                await ctx.fns.llms.submitLoginCode({provider:'claude-code',account,code});
                return reply({message:'Code sent to Claude Code.'});
            }
            case 'cancel':{
                if(!id)return reply({error:'Login id required'},400);
                if(provider==="anthropic-oauth")await ctx.fns.llm.cancelAnthropicOAuth({id});
                else await ctx.fns.sshAccount.cancel({id});
                return reply({message:'Authorization cancelled.'});
            }
            case 'users':{
                if(!provider||!account)return reply({error:'Provider and account required'},400);
                return reply({users:await ctx.fns.llm.accountUsers({provider,account})});
            }
            case 'remove':{
                if(provider!=='anthropic-oauth'&&provider!=='xai'&&provider!=='claude-code'&&provider!=='codex'&&provider!=='kimi-coding')return reply({error:'This provider is configured in settings, not removable here'},400);
                if(!account)return reply({error:'Account required'},400);
                if(data.confirmed!==true)return reply({error:'Confirm removal before continuing'},400);
                const result=await ctx.fns.llm.removeAccount({provider,account,archiveUsers:data.archiveUsers===true});
                return reply({removed:`${result.provider}/${result.account}`,archived:result.archived,message:result.archived.length?`Account removed, ${result.archived.length} agent(s) archived.`:'Account removed.'});
            }
            default:return reply({error:'Unknown action'},400);
        }
    }catch(error){return reply({error:error instanceof Error?error.message:'LLM connection action failed'},422);}
}
