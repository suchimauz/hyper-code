/** Handles the HTTP route anthropic-oauth connect POST endpoint. */
export default async function (ctx: Context, _session: Session | null, opts: {
        /** Incoming HTTP request. */ req: Request;
        /** Route parameters captured from the request path. */ params: Record<string, string> }) {
    // A named slot is what makes this "add another Claude account" instead of
    // "replace the one I have". Empty means the default (first) account.
    let account = "default";
    let label: string | null = null;
    let proxyId:string|undefined;
    let invalid=false;
    try {
        const form = await opts.req.formData();
        account = String(form.get("account") ?? "").trim().replace(/[^\w\-.]/g, "").slice(0, 40) || "default";
        label = String(form.get("label") ?? "").trim().slice(0, 80) || null;
        const selected=form.get("proxyId");if(selected!==null){if(typeof selected!=="string"||!selected.trim())invalid=true;else proxyId=selected.trim();}
        if(form.get("instance") || form.get("method")==="cli")invalid=true;
    } catch { /* no body: the plain Connect button */ }
    if(invalid)return new Response("Proxy selection requires local OAuth",{status:400});
    const login = await ctx.fns.llm.startAnthropicOAuth({ account, label, ...(proxyId?{proxyId}:{}) });
    // Keep the user on mauzcode so the manual fallback and status are always
    // available; the connections page opens the safe authorization URL.
    void login;
    return new Response(null, { status: 303, headers: { location: "/llms" } });
}
