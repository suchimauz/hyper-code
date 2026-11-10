/**
 * Authenticate a browser and dispatch its Web Push opt-in: config snapshot (owner's active devices as endpoint hashes and browser labels), subscribe and unsubscribe. Subscribe accepts an optional bounded userAgent string persisted for device naming. Unsubscribe takes the caller's own `endpoint` (session-scoped) or a `subscriptionId` (owner-scoped) so Settings can remove any of the owner's devices.
 *
 * Routes require a real active user and verified session cookie; mutations require same-origin CSRF. Subscriptions are session-bound and never reassigned. The config payload lists the owner's active devices (id, endpoint hash, timestamps, provider, this-login marker) without raw endpoints or keys.
 * @param opts.req Incoming request with authentication cookie.
 * @param opts.action Fixed operation selected by the route.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming request with authentication cookie. */
        req: Request;
        /** Fixed operation selected by the route. */
        action: "config"|"subscribe"|"unsubscribe";
    },
): Promise<Response> {
    const req=opts.req;
    const identity=session?.user?.id;
    const response=(body:object,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
    if(!identity)return response({error:'Authentication required'},401);
    const raw=new Bun.CookieMap(req.headers.get('cookie')??'').get(ctx.fns.procs.auth.cookieName({}));
    const binding=raw?await ctx.fns.webPush.sessionBinding({token:raw}):null;
    if(!binding||binding.ownerId!==identity||!Number.isFinite(binding.expiresAt)||binding.expiresAt<=Date.now())return response({error:'Authentication required'},401);
    const users=await ctx.fns.procs.db.select({sql:'SELECT id FROM users WHERE id = ? AND disabled_at IS NULL',params:[identity]});
    if(!users.length)return response({error:'Authentication required'},401);
    if(opts.action==='config'){
        const csrf = await ctx.fns.auth.csrfToken({req});
        const origin=await ctx.fns.http.publicOrigin({req});
        if(!origin.startsWith('https://'))return response({enabled:false,publicKey:null,userId:identity,binding:binding.key,devices:[],csrf});
        const keys=await ctx.fns.webPush.vapid({subject:origin});
        // Owner-scoped active subscriptions only; raw endpoints and session keys never leave the server.
        const subs=await ctx.fns.procs.db.select({sql:'SELECT id,endpoint,created_at,expires_at,session_key,user_agent FROM web_push_subscriptions WHERE owner_id=? AND expires_at>? ORDER BY created_at ASC',params:[identity,Date.now()]});
        const {createHash}=await import('node:crypto');
        const provider=(endpoint:string)=>{try{const host=new URL(endpoint).hostname;if(host==='web.push.apple.com')return 'apple';if(host==='fcm.googleapis.com')return 'google';if(host==='push.services.mozilla.com'||/^[a-z0-9-]{1,63}\.push\.services\.mozilla\.com$/.test(host))return 'mozilla';}catch{}return 'other';};
        const devices=subs.map(s=>({id:String(s.id),endpointHash:createHash('sha256').update(String(s.endpoint)).digest('hex'),createdAt:Number(s.created_at),expiresAt:Number(s.expires_at),provider:provider(String(s.endpoint)),userAgent:s.user_agent?String(s.user_agent):null,current:s.session_key===binding.key}));
        return response({enabled:true,publicKey:keys.publicKey,userId:identity,binding:binding.key,devices,csrf});
    }
    const origin=await ctx.fns.http.publicOrigin({req});
    if(!origin.startsWith('https://')||req.headers.get('origin')!==origin||!await ctx.fns.auth.verifyCsrf({req,token:req.headers.get('x-csrf-token')??''}))return response({error:'Invalid request origin'},403);
    if(!req.headers.get('content-type')?.startsWith('application/json'))return response({error:'JSON required'},415);
    const reader=req.body?.getReader(); if(!reader)return response({error:'Body required'},400);
    let text='';let size=0;const decoder=new TextDecoder();while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>8192){await reader.cancel();return response({error:'Body too large'},413);}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();
    let data:{subscription?:{endpoint:string;keys:{p256dh:string;auth:string}};endpoint?:string;userAgent?:string};try{data=JSON.parse(text);}catch{return response({error:'Invalid JSON'},400);}
    if(!data||typeof data!=='object'||Object.keys(data).some(k=>!((opts.action==='subscribe'&&(k==='subscription'||k==='userAgent'))||(opts.action==='unsubscribe'&&(k==='endpoint'||k==='subscriptionId')))))return response({error:'Invalid request'},400);
    // Optional coarse browser label from the opt-in gesture only; bounded, never trusted as identity.
    const userAgent=opts.action==='subscribe'&&typeof data.userAgent==='string'&&data.userAgent.length>0&&data.userAgent.length<=512?data.userAgent:null;
    if(opts.action==='unsubscribe'){
        // Owner-scoped removal by id lets Settings retire any of the owner's devices; endpoint removal stays session-scoped for the browser's own subscription.
        if(typeof data.subscriptionId==='string'&&data.subscriptionId.length>0&&data.subscriptionId.length<=200){await ctx.fns.procs.db.run({sql:'DELETE FROM web_push_subscriptions WHERE id = ? AND owner_id = ?',params:[data.subscriptionId,identity]});return response({ok:true});}
        if(typeof data.endpoint!=='string'||data.endpoint.length>2048)return response({error:'Invalid endpoint'},400);
        await ctx.fns.procs.db.run({sql:'DELETE FROM web_push_subscriptions WHERE endpoint = ? AND owner_id = ? AND session_key = ?',params:[data.endpoint,identity,binding.key]});return response({ok:true});}
    let sub;try{sub=await ctx.fns.webPush.validateSubscription({subscription:data.subscription!});}catch{return response({error:'Invalid subscription'},400);}
    const saved=await ctx.fns.procs.db.transaction({fn:async()=>{
    await ctx.fns.procs.db.select({sql:'SELECT pg_advisory_xact_lock(hashtext(?))',params:['webpush:'+identity]});
    await ctx.fns.procs.db.run({sql:'DELETE FROM web_push_subscriptions WHERE owner_id=? AND expires_at<=?',params:[identity,Date.now()]});
    const existing=await ctx.fns.procs.db.select({sql:'SELECT owner_id,session_key FROM web_push_subscriptions WHERE endpoint = ?',params:[sub.endpoint]});
    if(existing.length){
        if(existing[0].owner_id!==identity||existing[0].session_key!==binding.key)return false;
        await ctx.fns.procs.db.run({sql:'UPDATE web_push_subscriptions SET p256dh=?,auth=?,expires_at=?,user_agent=? WHERE endpoint=? AND owner_id=? AND session_key=?',params:[sub.keys.p256dh,sub.keys.auth,binding.expiresAt,userAgent,sub.endpoint,identity,binding.key]});
        return true;
    }
    const count=await ctx.fns.procs.db.select({sql:'SELECT count(*) AS n FROM web_push_subscriptions WHERE owner_id = ?',params:[identity]});if(Number(count[0].n)>=10)return false;
    const inserted=await ctx.fns.procs.db.select({sql:'INSERT INTO web_push_subscriptions (id,owner_id,session_key,session_id,endpoint,p256dh,auth,expires_at,created_at,user_agent) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT (endpoint) DO NOTHING RETURNING id',params:[Bun.randomUUIDv7(),identity,binding.key,binding.sessionId,sub.endpoint,sub.keys.p256dh,sub.keys.auth,binding.expiresAt,Date.now(),userAgent]});return inserted.length>0;
    }});
    return saved?response({ok:true}):response({error:'Subscription unavailable; disable and enable again'},409);
}
