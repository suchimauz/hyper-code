/**
 * Serve owner-only proxy registry JSON and guarded saved proxy operations
 *
 * Use for settings/proxies routes. Enforces authentication mode, owner role, same-origin cookie CSRF, bounded JSON writes and safe credential-free responses.
 * @param opts.req Incoming browser settings request.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming browser settings request. */
        req: Request;
    },
): Promise<Response> {
    const req=opts.req;const reply=(body:object,status=200,extra:Record<string,string>={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie',...extra}});
    const who=await ctx.fns.auth.currentUser({req});if(who.required&&!who.user&&!who.legacy)return reply({error:'Unauthorized'},401);if(who.user&&who.user.role!=='owner')return reply({error:'Owner access required'},403);
    if(req.method==='GET'){try{return reply({items:await ctx.fns.socksProxy.list({})});}catch{return reply({error:'Proxy operation failed'},500);}}
    if(req.method!=='POST')return reply({error:'Method not allowed'},405);
    if(req.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Same origin required'},403);const origin=req.headers.get('origin');if(origin!==null&&origin!==await ctx.fns.http.publicOrigin({req}))return reply({error:'Same origin required'},403);
    if(!await ctx.fns.auth.verifyCsrf({req,token:req.headers.get('x-csrf-token')??''}))return reply({error:'Invalid request token'},403);
    if(req.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'JSON required'},415);
    const reader=req.body?.getReader();let raw='';let size=0;const decoder=new TextDecoder();if(reader){try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>65536){await reader.cancel();return reply({error:'Request too large'},413);}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();}catch{return reply({error:'Invalid request'},400);}finally{reader.releaseLock();}}
    let data:Record<string,any>;try{data=JSON.parse(raw);}catch{return reply({error:'Invalid JSON'},400);}if(!data||typeof data!=='object'||Array.isArray(data))return reply({error:'Invalid request'},400);
    try{const fields={name:data.name,host:data.host,port:data.port,auth:data.auth,username:data.username,password:data.password};
    switch(data.action){case 'add':return reply({item:await ctx.fns.socksProxy.create(fields)});case 'update':return reply({item:await ctx.fns.socksProxy.update({id:data.id,revision:data.revision,...fields})});case 'remove':return reply(await ctx.fns.socksProxy.remove({id:data.id,revision:data.revision}));case 'check':{await ctx.fns.socksProxy.validateIdentity({id:data.id});const result=await ctx.fns.socksProxy.check({id:data.id});return reply(result,result.code==='rate_limit'||result.code==='busy'?429:200,result.retryAfter?{'Retry-After':String(result.retryAfter)}:{});}default:return reply({error:'Unknown action'},400);}
    }catch(error){const status=(error as {status?:number}).status;if((error as {code?:string}).code==='PROXY_IN_USE')return reply({error:(error as Error).message,code:'PROXY_IN_USE',users:(error as Error & {users:object[]}).users},409);return reply({error:status===409?'Proxy changed; reload and try again':status===404?'Proxy not found':status===400?'Invalid proxy fields':'Proxy operation failed'},status===409||status===404||status===400?status:500);}
}
