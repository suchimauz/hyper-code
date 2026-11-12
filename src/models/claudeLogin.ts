/**
 * Start, inspect, submit or cancel a Claude authorization-code PKCE login.
 *
 * Keeps one process-local ten-minute flow per connection with optional loopback callback and pasted-code fallback. Exchanges each code once through the approved transport, persists encrypted tokens and returns safe public flow metadata. Starting cancels pending flows.
 * @param opts.conn Resolved connection transport for token exchange.
 * @param opts.op Login operation.
 * @param opts.flowId Exact current flow identifier required for submission.
 * @param opts.code Authorization code, code#state or callback URL; never logged or returned.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved connection transport for token exchange. */
        conn: types.models.ResolvedConnection;
        /** Login operation. */
        op: "start" | "status" | "submit" | "cancel";
        /** Exact current flow identifier required for submission. */
        flowId?: string;
        /** Authorization code, code#state or callback URL; never logged or returned. */
        code?: string;
    },
): Promise<Omit<types.models.LoginFlow, "abort" | "done"> | null> {
    const {conn,op}=opts;
    type Flow={flowId:string;status:'pending'|'succeeded'|'failed'|'expired';authorizationUrl:string;expiresAt:number;message?:string;verifier:string;state:string;busy:boolean;abort:AbortController;server?:ReturnType<typeof Bun.serve>;timer?:ReturnType<typeof setTimeout>};
    ctx.state.models ??= {};
    const state=ctx.state.models as typeof ctx.state.models & {claudeFlows?:Record<string,Flow>};
    const flows=state.claudeFlows ??= {};
    const view=(f?:Flow)=>f?{flowId:f.flowId,kind:'authorization-code' as const,status:f.status,authorizationUrl:f.authorizationUrl,expiresAt:f.expiresAt,callbackListening:!!f.server,message:f.message}:null;
    const finish=(f:Flow,status:Flow['status'],message:string)=>{f.status=status;f.message=message;f.verifier='';f.state='';clearTimeout(f.timer);f.abort.abort();f.server?.stop();f.server=undefined;};
    let flow=flows[conn.id];
    if(flow?.status==='pending'&&flow.expiresAt<=Date.now())finish(flow,'expired','Login expired');
    if(op==='status')return view(flow);
    if(op==='cancel'){if(flow?.status==='pending')finish(flow,'failed','Login cancelled');await (ctx.state.models as typeof ctx.state.models & {claudeMutations?:Record<string,Promise<void>>}).claudeMutations?.[conn.id];return view(flow);}
    const constants=ctx.fns.llm.anthropicOAuthConstants({});
    const submit=async(f:Flow,input:string,callback=false)=>{
     if(f.status!=='pending'||f.busy)return view(f);
     if(f.expiresAt<=Date.now()){finish(f,'expired','Login expired');return view(f);}
     const parsed=ctx.fns.llm.parseAnthropicAuthorizationInput({input});
     if(!parsed.code||(callback&&!parsed.state)||(parsed.state&&parsed.state!==f.state)){f.message='Invalid authorization code or state';return view(f);}
     f.busy=true;
     try{
     const response=await ctx.fns.models.claudeRequest({conn,url:constants.tokenUrl,init:{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},signal:f.abort.signal,body:JSON.stringify({grant_type:'authorization_code',client_id:constants.clientId,code:parsed.code,state:f.state,redirect_uri:constants.redirectUri,code_verifier:f.verifier})}});
     if(!response.ok){await response.body?.cancel();throw new Error('Exchange rejected');}
     const tokens=await response.json() as {access_token:string;refresh_token?:string;expires_in?:number};
     if(f.status!=='pending'||f.abort.signal.aborted)return view(f);
     await ctx.fns.models.claudeAuth({conn,op:'store',tokens,signal:f.abort.signal});
     if(f.status==='pending')finish(f,'succeeded','Logged in');
     }catch{if(f.status==='pending')finish(f,'failed','Token exchange failed; start login again');}
     return view(f);
    };
    if(op==='submit'){
     if(!flow||opts.flowId!==flow.flowId)throw Object.assign(new Error('Login flow not found'),{status:409});
     return submit(flow,opts.code??'');
    }
    if(flow?.status==='pending')finish(flow,'failed','Login replaced');
    const random=()=>Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
    const verifier=random(),oauthState=random();
    // Synchronous hashing keeps cancellation and flow installation atomic across concurrent starts.
    const challenge=new Bun.CryptoHasher('sha256').update(verifier).digest('base64url');
    const url=new URL(constants.authorizeUrl);url.search=new URLSearchParams({code:'true',client_id:constants.clientId,response_type:'code',redirect_uri:constants.redirectUri,scope:constants.scopes,code_challenge:challenge,code_challenge_method:'S256',state:oauthState}).toString();
    flow={flowId:crypto.randomUUID(),status:'pending',authorizationUrl:url.toString(),expiresAt:Date.now()+600000,verifier,state:oauthState,busy:false,abort:new AbortController()};
    flows[conn.id]=flow;
    const active=flow;
    active.timer=setTimeout(()=>{if(active.status==='pending')finish(active,'expired','Login expired');},600000);active.timer.unref();
    const redirect=new URL(constants.redirectUri);
    if(['localhost','127.0.0.1'].includes(redirect.hostname)&&redirect.protocol==='http:'){
     try{
     active.server=Bun.serve({hostname:'127.0.0.1',port:Number(redirect.port||80),fetch:async(request)=>{
     const u=new URL(request.url);
     if(request.method!=='GET'||u.pathname!==redirect.pathname)return new Response('Not found',{status:404});
     const parsed=ctx.fns.llm.parseAnthropicAuthorizationInput({input:u.toString()});
     if(!parsed.state||parsed.state!==active.state||!parsed.code)return new Response('Invalid authorization response',{status:400});
     await submit(active,u.toString(),true);
     return new Response(active.status==='succeeded'?'Login complete. Return to MauzCode.':'Login did not complete. Return to MauzCode.',{headers:{'content-type':'text/plain','cache-control':'no-store'}});
     }});
     }catch{active.message='Local callback unavailable; paste the callback URL or code';}
    }
    return view(active);
}
