/**
 * Render only the secure live input compatibility card for a durable input event.
 * Ordinary transcript events are structured data rendered by the native React transcript.
 * This does not rewrite historical event HTML or assistant respondHtml output.
 * @param opts.event Durable input event; other event types intentionally return an empty string.
 * @param opts.agentId Owning agent identifier retained for compatibility with input callers.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Durable event identity; only input events use this compatibility renderer. */
    event: { type?: string; inputId?: string; [key: string]: unknown };
    /** Owning agent identifier retained for existing input callers. */
    agentId?: string;
}): Promise<string> {
    if (opts.event?.type !== 'input') return '';
    return ctx.fns.input?.card ? await ctx.fns.input.card({ id: String(opts.event.inputId ?? '') }) : '';
}
