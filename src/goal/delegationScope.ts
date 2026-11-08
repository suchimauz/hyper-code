/**
 * Bind immutable delegation authority to the current tool invocation
 *
 * Internal run-owned asynchronous scope. Wrap Goal tool dispatch with the captured RunState binding and read it in publication adapters; never obtain authority from model options, scratchpad, lineage or a later database claim. Scope is process-local and grants no authority without durable reservation validation.
 * @param opts.action Enter a trusted tool dispatch scope, read authority, or clear inherited authority for ordinary nested dispatch.
 * @param opts.binding Exact binding captured by the run owner, required when entering a scope.
 * @param opts.fn Trusted tool dispatch callback executed inside the invocation scope.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Enter a trusted tool dispatch scope, read authority, or clear inherited authority for ordinary nested dispatch. */
        action: "with" | "read" | "clear";
        /** Exact binding captured by the run owner, required when entering a scope. */
        binding?: types.goal.RunState["binding"];
        /** Trusted tool dispatch callback executed inside the invocation scope. */
        fn?: () => Promise<unknown>;
    },
): Promise<unknown> {
    const { AsyncLocalStorage } = await import('node:async_hooks');
    const holder = ctx.state as typeof ctx.state & {goalDelegationScope?: InstanceType<typeof AsyncLocalStorage>};
    const storage = holder.goalDelegationScope ??= new AsyncLocalStorage();
    if (opts.action === 'read') return storage.getStore();
    if (opts.action === 'clear') {
        if (!opts.fn) throw new Error('Cleared delegation scope requires callback');
        return storage.run(undefined, opts.fn);
    }
    const b = opts.binding;
    if (!b || !b.rootAgentId || !b.sourceAgentId || !b.goalId || !b.runToken || !opts.fn) throw new Error('Delegation scope requires captured run binding and callback');
    const authority = Object.freeze({rootAgentId:b.rootAgentId,goalId:b.goalId,sourceAgentId:b.sourceAgentId,runToken:b.runToken,...(b.authority ? {parentCapabilityId:b.authority.capabilityId} : {})});
    return storage.run(authority, opts.fn);
}
