// One relay for the three wire formats. The body is the client's own provider
// request; we look the model up in the catalogue the client is entitled to,
// swap in our credential (node.upstream) or forward to one of our own nodes
// (chaining), and stream the answer back untouched together with the headers
// the client's classifyError needs.
/**
 * Relay one provider request from a node client through this host's credentials or a chained node
 *
 * Authorizes the request, maps body.model to an entitled catalogue entry,
 * resolves canonical provider/account:model IDs (or unambiguous legacy IDs),
 * strips only the routing prefix before sending the body with the host's credential and
 * identity headers (or to the next node with the hop counter incremented) and
 * returns the upstream response 1:1 including streaming body, status,
 * retry-after and rate-limit headers. Preserves Responses session and turn
 * metadata and the allowlisted Anthropic compaction beta across hops without
 * forwarding client credentials or identity headers; host beta flags are retained.
 * Missing exact Codex routes return retriable 503 during a recent transient
 * catalogue failure, never forwarding unverified models; definitive absence is 404.
 * @param opts.req Incoming client request with the provider JSON body.
 * @param opts.api Wire api named by the route.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Incoming client request. */
        req: Request;
        /** Wire api named by the route. */
        api: "anthropic" | "responses" | "openai";
    },
): Promise<Response> {
    const auth = await ctx.fns.node.authorize({ req: opts.req });
    if (!auth.ok) return auth.response;
    const body = await opts.req.text();
    let model = "";
    try { model = String(JSON.parse(body)?.model ?? ""); } catch { return Response.json({ error: "invalid JSON body" }, { status: 400 }); }
    if (!model) return Response.json({ error: "body.model is required" }, { status: 400 });
    const catalog = await ctx.fns.node.catalog({ providers: auth.client.providers, excludeNode: auth.client.name, hops: auth.hops });
    const offered = catalog.filter((e) => e.api === opts.api);
    const exact = offered.find((e) => e.id === model);
    // Legacy bare IDs are accepted only when they identify one credential.
    // Never silently switch to the first account after an account is added.
    const legacy = exact ? [] : offered.filter((e) => e.id.replace(/^[a-z][\w-]*\/[\w.-]+:/, "") === model);
    const entry = exact ?? (legacy.length === 1 ? legacy[0] : undefined);
    if (!entry) {
        // A failed discovery probe is not authoritative evidence that an exact
        // account/model was revoked. Fail closed without forwarding or inventing
        // models, but let callers retry rather than treating it as an invalid ID.
        const route = /^codex\/([\w.-]+):.+$/.exec(model);
        const failures = (ctx.state as any)?.llmModelCatalogFailures?.skipNodes;
        const permitted = !auth.client.providers.length || auth.client.providers.includes("codex");
        if (route && opts.api === "responses" && permitted && failures &&
            Date.now() - failures.at < 120_000 && failures.codex.includes(route[1]) &&
            ctx.fns.llm.accountCredentialExists({ provider: "codex", account: route[1] })) {
            return Response.json({ error: `model catalogue temporarily unavailable for codex/${route[1]}; retry discovery` },
                { status: 503, headers: { "retry-after": "5" } });
        }
        return Response.json({ error: `model not offered to this client: ${model} (${opts.api})` }, { status: 404 });
    }
    // Only conversation metadata may cross the authentication boundary; the
    // host/next node still owns authorization and provider identity headers.
    const metadata: Record<string, string> = {};
    if (opts.api === "responses") {
        for (const name of ["session_id", "x-codex-turn-metadata"]) {
            const value = opts.req.headers.get(name);
            if (value) metadata[name] = value;
        }
    }
    // Feature negotiation only: never forward arbitrary beta or identity flags.
    if (opts.api === "anthropic" && ["anthropic", "claude-code", "anthropic-oauth"].includes(entry.provider)) {
        const betas = (opts.req.headers.get("anthropic-beta") ?? "").split(",").map(value => value.trim());
        if (betas.includes("compact-2026-09-04")) metadata["anthropic-beta"] = "compact-2026-09-04";
    }
    const started = performance.now();
    let upstream: Response;
    if (entry.via) {
        const nodeName = entry.via.replace(/^hyper\//, "");
        const node = await ctx.fns.node.get({ name: nodeName });
        if (!node) return Response.json({ error: `node ${nodeName} is not configured` }, { status: 502 });
        const token = await ctx.fns.node.token({ name: nodeName });
        const wireBody = JSON.stringify({ ...JSON.parse(body), model: entry.id });
        const path = opts.api === "openai" ? "chat" : opts.api;
        upstream = await fetch(`${node.url}/${path}`, { method: "POST", signal: opts.req.signal, body: wireBody,
            headers: { ...metadata, "content-type": "application/json", authorization: `Bearer ${token}`, "x-hyper-hops": String(auth.hops + 1), accept: opts.req.headers.get("accept") ?? "*/*" } });
    } else {
        const up = await ctx.fns.node.upstream({ provider: entry.provider, account: entry.account, api: opts.api, sessionId: opts.req.headers.get("session_id") ?? undefined });
        if (!up) return Response.json({ error: `${entry.provider}: no credentials on the host` }, { status: 503 });
        const prefix = `${entry.provider}/${entry.account}:`;
        const upstreamModel = entry.id.startsWith(prefix) ? entry.id.slice(prefix.length) : entry.id;
        const wireBody = JSON.stringify({ ...JSON.parse(body), model: upstreamModel });
        const headers = { ...up.headers, ...(entry.provider === "codex" ? metadata : {}) };
        if (metadata["anthropic-beta"]) {
            headers["anthropic-beta"] = [...new Set([...(headers["anthropic-beta"] ?? "").split(","), metadata["anthropic-beta"]].map(value => value.trim()).filter(Boolean))].join(",");
        }
        upstream = await fetch(up.url, { method: "POST", headers, body: wireBody, signal: opts.req.signal });
    }
    const out = new Headers({ "cache-control": "no-store" });
    for (const name of ["content-type", "retry-after", "request-id", "anthropic-request-id", "x-request-id"]) { const v = upstream.headers.get(name); if (v) out.set(name, v); }
    upstream.headers.forEach((v, k) => { if (/ratelimit/i.test(k)) out.set(k, v); });
    ctx.fns.procs.log.info({ event: "node.relay", client: auth.client.name, model, api: opts.api, via: entry.via ?? entry.provider, status: upstream.status, durationMs: Math.round(performance.now() - started) });
    return new Response(upstream.body, { status: upstream.status, headers: out });
}
