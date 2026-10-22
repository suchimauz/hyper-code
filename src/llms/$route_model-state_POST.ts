/**
 * Enable or disable one exact model route from LLM Connections.
 *
 * Persist an explicit desired state, not a toggle, so duplicate submissions are
 * idempotent. Return only the updated control for HTMX, or redirect ordinary
 * forms back to Connections. This never calls inference or changes chat models.
 * @param opts.req Incoming form request with model and disabled=true|false.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming form request carrying an exact model route and explicit desired disabled state. */
    req: Request;
}): Promise<Response> {
    const form = await opts.req.formData();
    const model = form.get('model');
    const disabled = form.get('disabled');
    if (typeof model !== 'string' || !model.trim() || (disabled !== 'true' && disabled !== 'false')) {
        return new Response('Invalid model policy form', {status:400});
    }
    await ctx.fns.llm.modelPolicy({action:'set',model,disabled:disabled === 'true'});
    if (opts.req.headers.get('HX-Request') !== 'true') return new Response(null,{status:303,headers:{location:'/llms'}});
    const html = ctx.fns.llms.modelControl({model,disabled:disabled === 'true',switchOnly:form.get('switchOnly') === 'true'});
    return new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}});
}
