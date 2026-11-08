/**
 * List and manage owner SSH instances for the UI Lab settings screen
 *
 * Use for the React Settings → SSH Instances tab. GET returns secret-free descriptors (name, endpoint, public key, pinned host key) plus a cookie-bound CSRF token. POST accepts one JSON action (create, save, trust, probe, remove) after owner, same-origin, CSRF, content-type and size checks, and delegates to the native sshInstance functions. Trust and remove require explicit confirmed:true. Never returns private keys and never changes remote servers except the read-only probe.
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
    if(user.role!=='owner')return reply({error:'Only owners can manage SSH instances'},403);
    const project=(i:types.sshInstance.Instance)=>({name:i.name,host:i.host,user:i.user,port:i.port,publicKey:i.publicKey,pinnedHostKey:i.pinnedHostKey,updatedAt:i.updatedAt});
    if(req.method==='GET'){
        try{
            const items=await ctx.fns.sshInstance.list({});
            return reply({instances:items.map(project),csrfToken:await ctx.fns.auth.csrfToken({req})});
        }catch(error){return reply({error:error instanceof Error?error.message:'Could not load SSH instances'},500);}
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
    const str=(k:string)=>typeof data[k]==='string'?(data[k] as string).trim():null;
    const name=str('name');
    if(!name)return reply({error:'Instance name required'},400);
    const endpoint=()=>{
        const host=str('host'),login=str('user'),port=data.port;
        if(!host||!login||typeof port!=='number'||!Number.isInteger(port)||port<1||port>65535)return null;
        return {name,host,user:login,port};
    };
    try{
        switch(data.action){
            case 'create':{const e=endpoint();if(!e)return reply({error:'Host, user and port 1–65535 are required'},400);const item=await ctx.fns.sshInstance.create(e);return reply({instance:project(item),message:'Added locally. Install the public key and verify the host key before connecting.'},201);}
            case 'save':{const e=endpoint();if(!e)return reply({error:'Host, user and port 1–65535 are required'},400);const item=await ctx.fns.sshInstance.save(e);return reply({instance:project(item),message:'Connection saved. If the destination changed, verify its host key and reconnect provider accounts.'});}
            case 'trust':{
                const hostKey=str('hostKey');
                if(!hostKey)return reply({error:'Host key required'},400);
                if(data.confirmed!==true)return reply({error:'Confirm independent host-key verification before continuing'},400);
                const item=await ctx.fns.sshInstance.trust({name,hostKey,confirmed:true,replace:data.replace===true});
                return reply({instance:project(item),message:'Verified host key saved. You can now test the connection.'});
            }
            case 'probe':{const p=await ctx.fns.sshInstance.probe({name});return reply({probe:p,message:`Remote check: python3 ${p.python3?'available':'missing'}, codex ${p.codex?'available':'missing'}, claude ${p.claude?'available':'missing'}.`});}
            case 'remove':{
                if(data.confirmed!==true)return reply({error:'Confirm removal before continuing'},400);
                await ctx.fns.sshInstance.remove({name,confirmed:true});
                return reply({removed:name,message:'Instance and local account records removed. Remote credentials and authorized_keys were not changed.'});
            }
            default:return reply({error:'Unknown action'},400);
        }
    }catch(error){return reply({error:error instanceof Error?error.message:'SSH action failed'},422);}
}
