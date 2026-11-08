/**
 * Persist structured command invocation or result without creating a model turn
 *
 * Call inside the command claim or completion transaction. UI metadata is separate from messages so control commands never become ordinary user prompts.
 * @param opts.agentId Owning session.
 * @param opts.type Presentation event phase.
 * @param opts.commandName Catalog command name without slash.
 * @param opts.commandText Canonical exact submitted slash text.
 * @param opts.requestId Idempotency key.
 * @param opts.operationId Durable operation identity.
 * @param opts.status Operation lifecycle state.
 * @param opts.text Human-readable result or invocation.
 * @param opts.result Optional structured engine result.
 * @param opts.error Failure explanation when present.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Owning session. */
        agentId: string;
        /** Presentation event phase. */
        type: 'command_invocation' | 'command_result';
        /** Catalog command name without slash. */
        commandName: string;
        /** Canonical exact submitted slash text. */
        commandText: string;
        /** Idempotency key. */
        requestId: string;
        /** Durable operation identity. */
        operationId: string;
        /** Operation lifecycle state. */
        status: 'running' | 'completed' | 'failed' | 'interrupted';
        /** Human-readable result or invocation. */
        text: string;
        /** Optional structured engine result. */
        result?: Record<string, unknown>;
        /** Failure explanation when present. */
        error?: string;
    },
): Promise<void> {
    const argsText=opts.commandText.replace(/^\/[\w-]+\s*/, '');
    const event={...opts,argsText,ts:Date.now(),html:''};
    event.html=await ctx.fns.agent.renderEventHtml({event,agentId:opts.agentId});
    await ctx.fns.session.appendEvent({id:opts.agentId,event});
}
