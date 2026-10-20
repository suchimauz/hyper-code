/** Handles owner-requested local onboarding, explicit host trust and SSH probes with same-origin checks. */
export default async function (ctx: Context, session: Session | null, opts: {req:Request;params:Record<string,string>}) {
    if ((session as Session & {user?:{role:string}})?.user?.role !== 'owner') return new Response('Only owners can manage SSH instances',{status:403});
    const origin=opts.req.headers.get('origin');
    if (!origin || origin !== new URL(opts.req.url).origin || opts.req.headers.get('sec-fetch-site')==='cross-site') return new Response('Same-origin request required',{status:403});
    const f=await opts.req.formData(); const value=(key:string)=>String(f.get(key)??'').trim();
    let message='';
    let result='success';
    try {
        switch(value('action')) {
            case 'create': await ctx.fns.sshInstance.create({name:value('name'),host:value('host'),user:value('user'),port:Number(value('port'))});message='Added locally. Install the public key and verify the host key before connecting.';break;
            case 'save': await ctx.fns.sshInstance.save({name:value('name'),host:value('host'),user:value('user'),port:Number(value('port'))});message='Connection saved. If the destination changed, verify its host key and reconnect provider accounts.';break;
            case 'remove': {
                if(value('confirmed')!=='yes') throw new Error('Confirm removal before continuing');
                await ctx.fns.sshInstance.remove({name:value('name'),confirmed:true});message='Instance and local account records removed. Remote credentials and authorized_keys were not changed.';break;
            }
            case 'trust': {
                if(value('confirmed')!=='yes') throw new Error('Confirm independent host-key verification before continuing');
                await ctx.fns.sshInstance.trust({name:value('name'),hostKey:value('hostKey'),confirmed:true,replace:value('replace')==='yes'});message='Verified host key saved. You can now test the connection.';break;
            }
            case 'probe': {const p=await ctx.fns.sshInstance.probe({name:value('name')});message=`Remote check: python3 ${p.python3?'available':'missing'}, codex ${p.codex?'available':'missing'}, claude ${p.claude?'available':'missing'}.`;break;}
            default: throw new Error('Unknown action');
        }
    }catch(error){result='error';message=error instanceof Error?error.message:'SSH action failed';}
    return new Response(null,{status:303,headers:{location:'/sshInstance?result='+result+'&message='+encodeURIComponent(message),'cache-control':'no-store'}});
}
