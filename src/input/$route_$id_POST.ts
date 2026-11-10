// Submit or cancel a chat input from its card. Answers with the re-rendered
// card, which htmx swaps in place: the answer on success, the same form with
// the error under it on a validation failure.
/**
 * Handle owner-only CSRF-protected input submission using form data or JSON {values,cancel?}.
 * JSON returns state/error only; dedicated completion kinds retain their separate authority. Existing HTML forms receive a re-rendered card.
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route path parameters.
 */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Incoming HTTP request. */
    req: Request;
    /** Route path parameters. */
    params: Record<string, string>;
}): Promise<Response> {
    const html = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    if (!await ctx.fns.auth.verifyCsrf({ req: opts.req, token: opts.req.headers.get("x-csrf-token") ?? "" })) {
        return Response.json({ error: "invalid csrf token" }, { status: 403 });
    }
    if (Number(opts.req.headers.get("content-length") ?? 0) > 1_000_000) return Response.json({ error: "input too large" }, { status: 413 });
    const id = String(opts.params.id ?? "");
    const user = (session as Session & {user?:{id:string;role?:string}})?.user;
    const reply = (body: object, status = 200) => Response.json(body, {status,headers:{'cache-control':'no-store',vary:'Cookie'}});
    if (!user || user.role !== 'owner') return reply({error:'Owner access required'},403);
    const url = new URL(opts.req.url);
    if (opts.req.method !== 'POST') return reply({error:'POST required'},405);
    if (opts.req.headers.get('sec-fetch-site') === 'cross-site' || (opts.req.headers.get('origin') && opts.req.headers.get('origin') !== url.origin)) return reply({error:'Same origin required'},403);
    const jsonBody = opts.req.headers.get('content-type')?.split(';')[0]?.trim() === 'application/json';
    const wantsJson = jsonBody || (opts.req.headers.get('accept') ?? '').includes('application/json');
    let form: { entries(): IterableIterator<[string, string | Blob]> };
    let jsonCancel = false;
    if (jsonBody) {
        const raw = await opts.req.text();
        if (raw.length > 1_000_000) return reply({error:'input too large'},413);
        let data: Record<string,unknown>;
        try { data = JSON.parse(raw); } catch { return reply({error:'Invalid JSON'},400); }
        if (!data || Array.isArray(data) || typeof data !== 'object' || Object.keys(data).some(k=>!['values','cancel'].includes(k)) || ('cancel' in data && typeof data.cancel !== 'boolean') || !data.values || typeof data.values !== 'object' || Array.isArray(data.values)) return reply({error:'Invalid input answer'},400);
        const nativeForm = new FormData();
        form = nativeForm;
        for (const [key,value] of Object.entries(data.values)) {
            if (key === '_action' || key === '__proto__' || key === 'constructor' || key === 'prototype' || !(typeof value === 'string' || Array.isArray(value) && value.every(v=>typeof v==='string'))) return reply({error:'Invalid input values'},400);
            for (const v of Array.isArray(value) ? value : [value]) nativeForm.append(key,v);
        }
        jsonCancel = data.cancel === true;
    } else {
        try { form = await opts.req.formData(); } catch { return reply({error:'Invalid form'},400); }
    }
    const values: Record<string, string | string[]> = {};
    for (const [key, raw] of form.entries()) {
        if (typeof raw !== "string") continue;
        const prev = values[key];
        values[key] = prev === undefined ? raw : Array.isArray(prev) ? [...prev, raw] : [prev, raw];
    }
    const cancel = jsonBody ? jsonCancel : values._action === "cancel";
    delete values._action;
    const actor = (session as any)?.user?.id ?? null;
    try {
        const input = await ctx.fns.input.get({ id });
        if (!input) return reply({error:'Input not found'},404);
        const active = await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id=? AND archived_at IS NULL',params:[input.agentId]});
        if (!active.length) return reply({error:'Input not found'},404);
        if (input.kind === 'planning-review') {
            if (jsonBody) return reply({error:'Use the dedicated planning review endpoint'},403);
            try {
                if (cancel) throw new Error('Choose Keep planning instead');
                await ctx.fns.planning.review({ req: opts.req, agentId: input.agentId, proposalId: String(values.proposalId ?? ''), decision: String(values.decision ?? '') as 'approve' | 'keep', expectedRevision: Number(values.expectedRevision) });
                return html(await ctx.fns.input.card({ id }));
            } catch (error) { return html(await ctx.fns.input.card({ id, error: String((error as Error).message) })); }
        }
        const out = await ctx.fns.input.submit({ id, values, cancel, actor });
        // The isolated secret field asks for JSON: it reports only state/error to its React card.
        if (wantsJson) return reply({ state: out.state, error: out.error ?? null }, out.error ? 400 : out.state === 'processing' ? 409 : 200);
        return html(await ctx.fns.input.card({ id, error: out.error ?? null }));
    } catch (error: any) {
        return Response.json({ error: String(error?.message ?? error) }, { status: 404 });
    }
}
