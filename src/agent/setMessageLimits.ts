/**
 * Enable or disable outgoing inter-agent messaging limits for one agent
 *
 * Persist an individual agent messaging policy in its durable scratchpad. Disable only when the owner accepts the risk of unlimited automated exchanges; other agents retain their own limits.
 * @param opts.id Identifier of the agent whose outgoing messages are configured.
 * @param opts.enabled Whether to enforce the 50-hop and 30-messages-per-ten-minutes limits.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Identifier of the agent whose outgoing messages are configured. */
        id: string;
        /** Whether to enforce the 50-hop and 30-messages-per-ten-minutes limits. */
        enabled: boolean;
    },
): Promise<{ enabled: boolean }> {
    const agent = ctx.state.agent[opts.id] ?? await ctx.fns.session.load({ id: opts.id });
    if (!agent) throw new Error(`agent not found: ${opts.id}`);
    const updated = await ctx.fns.session.mutateScratchpad({ id: opts.id, mutate: (scratchpad: Record<string, any>) => { scratchpad.messageLimitsEnabled = opts.enabled; } });
    agent.scratchpad = updated.scratchpad;
    ctx.fns.events.refreshAgentMeta({ agentId: opts.id, section: "all", reason: "message-limits" });
    return { enabled: opts.enabled };
}
