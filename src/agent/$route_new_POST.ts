/** Handles the new post HTTP route.  * @param opts.req Incoming HTTP request.
*/
export default async function (ctx: Context, _session: Session | null, opts: {
        /** Incoming HTTP request. */
req: Request }) {
    const form = await opts.req.formData();
    const values: Record<string, any> = {};
    for (const [name, value] of form) {
        if (values[name] === undefined) values[name] = String(value);
        else if (Array.isArray(values[name])) values[name].push(String(value));
        else values[name] = [values[name], String(value)];
    }
    const result = await ctx.fns.agent.createFromValues(values);
    if (result.error) return new Response(result.error, { status: 400 });
    if (result.confirmation) return Response.json({ confirmation: result.confirmation }, { status: 409 });
    return new Response(null, { status: 303, headers: { location: `/agent/${encodeURIComponent(result.agent.id)}` } });
}
