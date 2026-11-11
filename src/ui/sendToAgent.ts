/**
 * Start a background turn with text for an existing idle in-memory agent.
 * This is a server-side operation, not browser messaging. Optional navigation
 * emits ui.navigate for compatible consumers; the primary React shell does not
 * load /ui/control.js. opened reflects the option, not confirmed navigation.
 * @param opts.agentId Target agent identifier.
 * @param opts.text Text to send.
 * @param opts.open Whether to emit best-effort compatibility navigation.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
        /** Identifier of the existing in-memory agent to run. */ agentId: string;
        /** Text to send to the agent. */ text: string;
        /** Emit best-effort compatibility navigation after sending. @default false */ open?: boolean }) {
    const agent = (ctx.state as any).agent?.[opts.agentId];
    if (!agent) throw new Error('agent not found: ' + opts.agentId);
    const text = (opts.text ?? '').trim();
    if (!text) throw new Error('empty text');
    if (agent.isStreaming) throw new Error('agent busy');
    const offset = agent.events.length;
    agent.events.push({ type: 'user', text });
    if (opts.open) ctx.fns.procs.events.emit({ event: { type: 'ui.navigate', path: '/agent/' + encodeURIComponent(agent.id) } });
    agent.isStreaming = true;
    queueMicrotask(async () => {
        try { await ctx.fns.agent.run({ agent, userText: text }); }
        catch (e: any) { agent.events.push({ type: 'error', error: e.message }); }
        finally { agent.isStreaming = false; }
    });
    return { agentId: agent.id, offset, nextOffset: agent.events.length, opened: !!opts.open };
}
