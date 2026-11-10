/**
 * Guard SSH metadata and account changes without host-specific credential assumptions.
 *
 * Use for endpoint updates, first-time host-key pinning, and account registry/login mutations.
 * Checks persisted credential records before mutation and uses the global migration lease when active.
 * A new SSH endpoint never requires an existing Codex account or a previously pinned host key.
 * @param opts.operation Kind of SSH or account mutation being guarded.
 * @param opts.provider Provider affected by an account mutation; omitted for endpoint changes.
 * @param opts.action Registry action, including the read-only list fast path.
 * @param opts.instance Exact SSH instance affected by the mutation.
 * @param opts.account Exact account slot affected by an account mutation.
 * @param opts.work Mutation to execute only after the credential guard succeeds.
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
    if(!(ctx as any).state.codexTunnelAuthority){await (ctx as any).fns.codexTunnel.guard({operation:opts.operation,provider:opts.provider,action:opts.action,instance:opts.instance,account:opts.account});return opts.work();}
     (ctx as any).fns.codexTunnel.service({});
     return (ctx as any).state.codexSocksCandidate.gate.run(async()=>{await (ctx as any).fns.codexTunnel.guard({operation:opts.operation,provider:opts.provider,action:opts.action,instance:opts.instance,account:opts.account});return opts.work()});
}
