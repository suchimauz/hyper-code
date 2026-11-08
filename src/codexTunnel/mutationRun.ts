/**
 * Hold the owner mutation lease across validation, staging and final metadata commit.
 *
 * Hold the owner mutation lease across validation, staging and final metadata commit.
Login asynchronous completion re-enters registry under a new lease; pending flow blocks migration.
 * @param opts.operation Explicit operation input for this account operation.
 * @param opts.provider Explicit provider input for this account operation.
 * @param opts.action Explicit action input for this account operation.
 * @param opts.work Explicit work input for this account operation.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Explicit operation input for this account operation. */
        operation: 'login'|'registry'|'descriptor';
        /** Explicit provider input for this account operation. */
        provider?: string;
        /** Explicit action input for this account operation. */
        action?: string;
        /** Exact SSH instance affected by the mutation. */
        instance?: string;
        /** Exact isolated account affected by the mutation. */
        account?: string;
        /** Explicit work input for this account operation. */
        work: ()=>Promise<any>;
    },
): Promise<any> {
    if(opts.operation==='registry'&&opts.action==='list')return opts.work();
    const selected=opts.instance==='aeza-criminal-amarant'&&(opts.operation==='descriptor'||(opts.provider==='codex'&&opts.account==='test'));
    if(selected){const service=await (ctx as any).fns.codexTunnel.scopedService({instance:opts.instance,account:'test'});return service.exclusive(async()=>{await (ctx as any).fns.codexTunnel.guard(opts);return opts.work()})}
    if(!(ctx as any).state.codexTunnelAuthority){await (ctx as any).fns.codexTunnel.guard({operation:opts.operation,provider:opts.provider,action:opts.action,instance:opts.instance,account:opts.account});return opts.work();}
     (ctx as any).fns.codexTunnel.service({});
     return (ctx as any).state.codexSocksCandidate.gate.run(async()=>{await (ctx as any).fns.codexTunnel.guard({operation:opts.operation,provider:opts.provider,action:opts.action,instance:opts.instance,account:opts.account});return opts.work()});
}
