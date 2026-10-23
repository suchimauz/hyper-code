/**
 * Parse an Inspector compaction form and persist its percentage or reset.
 *
 * HTTP form handler shared by the compaction route and focused tests; validates textual number input before updating only this agent.
 * @param opts.req Incoming form POST request.
 * @param opts.id Target agent identifier from the route.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming form POST request. */
        req: Request;
        /** Target agent identifier from the route. */
        id: string;
    },
): Promise<Response> {
    const form = await opts.req.formData();
    const raw = form.get('percent');
    const reset = form.get('action') === 'inherit';
    if (!reset && (typeof raw !== 'string' || !raw.trim())) return new Response('Enter a percentage from 30 to 95.', {status: 400});
    try {
     await ctx.fns.agent.setCompaction({id: opts.id, percent: reset ? null : Number(raw)});
    } catch (error) { return new Response(error instanceof Error ? error.message : 'Invalid compaction settings', {status: 400}); }
    return new Response(null, {status: 204});
}
