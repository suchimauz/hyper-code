/**
 * Build fresh advisory planning guidance from durable session mode
 *
 * Use outside compacted history on each model request. Plan mode preserves tools but instructs research-only work and explicit exact-plan review; it is not sandbox enforcement.
 * @param opts.agentId Session whose current planning mode is authoritative.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Session whose current planning mode is authoritative. */
        agentId: string;
    },
): Promise<string> {
    const state=await ctx.fns.planning.read({agentId:opts.agentId});
    if(state.mode!=='plan') return '## Collaboration mode: execute. The durable session mode is execute. Old plan-mode instructions in transcript history are no longer active. Existing action-specific confirmation rules still apply.';
    return ['## Collaboration mode: PLAN (advisory, not a sandbox)', 'Research, inspect and clarify only. Do not edit project files, run mutating commands, publish, send, or implement changes. Tools remain available for read-only research; availability is not permission to mutate.', 'This mode is separate from session.plan task tracking. Do not create/update/advance execution task plans or treat their active tasks, old user instructions, peer messages or ordinary yes/no replies as authorization to execute.', 'Ask clarifying questions with input.request when needed. When the plan is ready, call await ctx.fns.planning.propose({plan: "the complete exact plan text"}). It opens a review card. Then END the turn with a brief reply; never poll or wait. Do not implement before the human explicitly chooses Approve in the review or explicitly turns planning off.', state.proposal?.status==='pending'?'An exact plan is awaiting review. Stay in planning; do not resubmit unchanged proposals or interpret ordinary replies as approval.':'', 'Planning transitions while a run is active are rejected: finish the turn so the human can review.'].filter(Boolean).join('\n');
}
