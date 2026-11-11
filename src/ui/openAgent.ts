/**
 * Emit a compatibility navigation request for an existing agent conversation.
 * Requires a ui.navigate consumer such as /ui/control.js in SSR documents;
 * the primary React shell does not load it. opened is not a navigation receipt.
 * @param opts.agentId Target agent identifier.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
        /** Identifier of an existing in-memory agent conversation. */ agentId: string }) {
    const agentId = opts.agentId;
    const agent = (ctx.state as any).agent?.[agentId];
    if (!agent) throw new Error('agent not found: ' + agentId);
    ctx.fns.procs.events.emit({ event: { type: 'ui.navigate', path: '/agent/' + encodeURIComponent(agentId) } });
    return { opened: agentId };
}
