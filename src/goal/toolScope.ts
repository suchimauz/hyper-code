/**
 * Bind immutable run-owned authority to native Goal tool invocations
 *
 * Internal trusted run integration only. Capture the exact claim, source role and goal CAS snapshot after accounting at each safe tool boundary, including absent goals. Clear inherited scope for unrelated nested dispatch. Does not grant durable authority or read mutable agent claim fields.
 * @param opts.action Enter a captured invocation, read its immutable authority, or clear inherited scope.
 * @param opts.binding Trusted run-owned claim and snapshot; required for with. Never populate from model arguments.
 * @param opts.fn Trusted dispatch callback required for with or clear.
 * @param opts.onMutation Trusted run-owned postcommit handoff invoked by mutation adapters.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Enter a captured invocation, read its immutable authority, or clear inherited scope. */
        action: "with" | "read" | "clear";
        /** Trusted run-owned claim and snapshot; required for with. Never populate from model arguments. */
        binding?: Readonly<{ sourceAgentId: string; ownerAgentId: string; runToken: string; role: "root" | "descendant" | "sidecar"; expectedGoalId: string | null; expectedRevision: number | null; maxTokenBudget: number | null }>;
        /** Trusted dispatch callback required for with or clear. */
        fn?: () => Promise<unknown>;
        /** Trusted run-owned postcommit handoff invoked by mutation adapters. Required for writable invocations. */
        onMutation?: (goal: types.goal.State | null) => Promise<void>;
    },
): Promise<unknown> {
    const { AsyncLocalStorage } = await import('node:async_hooks');
    const holder = ctx.state as typeof ctx.state & { goalToolScope?: InstanceType<typeof AsyncLocalStorage> };
    const storage = holder.goalToolScope ??= new AsyncLocalStorage();
    if (opts.action === 'read') return storage.getStore();
    if (!opts.fn) throw new Error('Goal invocation scope requires callback');
    if (opts.action === 'clear') return storage.run(undefined, opts.fn);
    const b = opts.binding;
    if (opts.action !== 'with' || !b || !b.sourceAgentId || !b.ownerAgentId || !b.runToken || !['root','descendant','sidecar'].includes(b.role) || (b.expectedGoalId === null ? b.expectedRevision !== null : !b.expectedGoalId || !Number.isSafeInteger(b.expectedRevision) || Number(b.expectedRevision) < 1) || (b.maxTokenBudget !== null && (!Number.isSafeInteger(b.maxTokenBudget) || b.maxTokenBudget <= 0))) throw new Error('Invalid captured Goal invocation authority');
    return storage.run(Object.freeze({...b, onMutation:opts.onMutation}), opts.fn);
}
