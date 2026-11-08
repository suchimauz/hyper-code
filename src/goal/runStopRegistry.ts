/**
 * Register or retrieve ephemeral goal accounting by immutable run ownership
 *
 * Internal Stop bridge. Stores live references outside scratchpad on process state across procedure reload. Compare-removes only the exact run reference and performs no database work.
 * @param opts.action Register, look up or compare-remove a run.
 * @param opts.agentId Captured source agent identity.
 * @param opts.runToken Immutable worker claim token.
 * @param opts.state Exact reference required for register and compare-remove.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Register, look up or compare-remove a run. */
        action: "register" | "get" | "remove";
        /** Captured source agent identity. */
        agentId: string;
        /** Immutable worker claim token. */
        runToken: string;
        /** Exact reference required for register and compare-remove. */
        state?: types.goal.RunState;
    },
): Promise<types.goal.RunState | undefined> {
    const holder=ctx.state as typeof ctx.state & {goalStopRuns?:Map<string,types.goal.RunState>};
    const runs=holder.goalStopRuns??=new Map();const key=JSON.stringify([opts.agentId,opts.runToken]);
    if(opts.action==='get') return runs.get(key);
    const s=opts.state;if(!s||!opts.runToken||s.binding.sourceAgentId!==opts.agentId||s.binding.runToken!==opts.runToken) throw new Error('Stop registry ownership mismatch');
    if(opts.action==='register') {const old=runs.get(key);if(old&&old!==s)throw new Error('Stop registry duplicate ownership');runs.set(key,s);return s;}
    if(runs.get(key)===s)runs.delete(key);return undefined;
}
