/**
 * Resolve an isolated owner-bound runtime for an explicitly selected Codex account
 *
 * Use for scoped import and persisted local routing of the supplied instance and account only. Never grants global cold authority or access to other account slots.
 * @param opts.instance Exact selected SSH instance.
 * @param opts.account Exact selected isolated account.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact selected SSH instance. */
        instance: string;
        /** Exact selected isolated account. */
        account: string;
    },
): Promise<any> {
    await ctx.fns.sshAccount.requireOwner({});
    const owner=await ctx.fns.codexAccount.inferenceOwner({});
    const b=await ctx.fns.codexAccount.binding(opts);if(b.owner!==owner)throw Error('Owner mismatch');
    const states=(ctx as any).state.codexScopedStates??=new Map();
    const key=JSON.stringify([owner,opts.instance,opts.account]);
    let state=states.get(key);if(!state){state={tails:new Map(),pending:new Map(),cold:false};states.set(key,state)}
    const scope=Object.freeze({owner,instance:opts.instance,account:opts.account,protectedSlot:''});
    const assertScope=(d:any)=>{if(d.provider!=='codex'||d.instance!==scope.instance||d.account!==scope.account)throw Error('Scoped owner or slot mismatch')};
    const claim=async()=>{const fs=await import('node:fs/promises');const os=await import('node:os');const path=await import('node:path');const directory=path.join(os.homedir(),'.mauzcode','codex-scoped-locks',b.name);await fs.mkdir(directory,{recursive:true,mode:0o700});return ctx.fns.codexTunnel.claim({directory})};
    const runtime=ctx.fns.codexTunnel.runtime({options:{state,assertScope,protectedSlot:scope.protectedSlot,claim}});
    return {runtime,exclusive:async(work:()=>Promise<any>)=>state.gate.run(work)};
}
