/**
 * Owner-only HTTP API for model providers and connections
 *
 * Backs GET/POST /models/api for the Models settings tab. GET returns the provider catalogue, secret-free connections, saved SOCKS proxies, trusted SSH instance names and a cookie-bound CSRF token. POST takes one JSON object `{ action, ... }` with action `providers`, `list`, `get`, `create`, `update`, `remove`, `test`, `models`, `usage` or `action`; it requires same origin, a valid `x-csrf-token`, `application/json` and at most 64 KiB. Non-owners get 403, anonymous 401. Responses never contain secret values or references.
 * @param opts.req Incoming GET or JSON POST request.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming GET or JSON POST request. */
        req: Request;
    },
): Promise<Response> {
    const headers = { "Cache-Control": "no-store", "Vary": "Cookie" };
    const reply = (body: object, status = 200) => Response.json(body, { status, headers });
    const req = opts.req;
    const user = (session as (Session & { user?: { id: string; role?: string; disabledAt?: number | null } }) | null)?.user;
    if (!user || user.disabledAt != null) return reply({ error: "Unauthorized" }, 401);
    if (!["GET", "POST"].includes(req.method)) return new Response(null, { status: 405, headers: { ...headers, Allow: "GET, POST" } });
    if (user.role !== "owner") return reply({ error: "Only owners can manage model connections" }, 403);
    const fail = (error: unknown) => {
        const e = error as { status?: unknown; code?: unknown; field?: unknown } | null;
        const status = typeof e?.status === "number" && e.status >= 400 && e.status < 500 ? e.status : e?.code === "TRANSPORT" ? 400 : 422;
        return reply({ error: ctx.fns.models.safeMessage({ message: error, fallback: "Model connection request failed" }), ...(typeof e?.code === "string" ? { code: e.code } : {}), ...(typeof e?.field === "string" ? { field: e.field } : {}) }, status);
    };
    if (req.method === "GET") {
        try {
            const [connections, proxies, instances] = await Promise.all([
                ctx.fns.models.list({}),
                ctx.fns.socksProxy.list({}).catch(() => []),
                ctx.fns.sshInstance.list({}).catch(() => []),
            ]);
            return reply({
                providers: ctx.fns.models.providers({}),
                connections,
                proxies: proxies.map(p => ({ id: p.id, name: p.name, host: p.host, port: p.port })),
                instances: instances.filter(i => !!i.pinnedHostKey).map(i => i.name),
                csrfToken: await ctx.fns.auth.csrfToken({ req }),
            });
        } catch (error) { return fail(error); }
    }
    if (req.headers.get("sec-fetch-site") === "cross-site") return reply({ error: "Same origin required" }, 403);
    const origin = req.headers.get("origin");
    if (origin !== null && origin !== await ctx.fns.http.publicOrigin({ req })) return reply({ error: "Same origin required" }, 403);
    if (!await ctx.fns.auth.verifyCsrf({ req, token: req.headers.get("x-csrf-token") || "" })) return reply({ error: "Invalid request token" }, 403);
    if (req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply({ error: "JSON body required" }, 415);
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > 65536) return reply({ error: "Request too large" }, 413);
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength > 65536) return reply({ error: "Request too large" }, 413);
    let data: Record<string, unknown>;
    try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply({ error: "Invalid JSON" }, 400); }
    if (!data || typeof data !== "object" || Array.isArray(data)) return reply({ error: "Invalid request" }, 400);
    const id = typeof data.id === "string" ? data.id : "";
    const record = (v: unknown) => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
    const optional = <T>(key: string): T | undefined => Object.hasOwn(data, key) ? data[key] as T : undefined;
    try {
        switch (data.action) {
            case "providers": return reply({ providers: ctx.fns.models.providers({}) });
            case "list": return reply({ connections: await ctx.fns.models.list({ ...(typeof data.provider === "string" ? { provider: data.provider } : {}) }) });
            case "get": return reply({ connection: await ctx.fns.models.get({ id }) });
            case "create": {
                if (typeof data.provider !== "string") return reply({ error: "Provider required", field: "provider" }, 400);
                const connection = await ctx.fns.models.create({
                    provider: data.provider,
                    accountName: typeof data.accountName === "string" ? data.accountName : "",
                    config: record(data.config) ?? {},
                    secrets: (record(data.secrets) ?? {}) as Record<string, string | null>,
                    ...(record(data.transport) ? { transport: data.transport as types.models.TransportSpec } : {}),
                    ...(typeof data.enabled === "boolean" ? { enabled: data.enabled } : {}),
                });
                return reply({ connection }, 201);
            }
            case "update": {
                const connection = await ctx.fns.models.update({
                    id,
                    ...(optional<string>("accountName") !== undefined ? { accountName: data.accountName as string } : {}),
                    ...(record(data.config) ? { config: data.config as Record<string, unknown> } : {}),
                    ...(record(data.secrets) ? { secrets: data.secrets as Record<string, string | null> } : {}),
                    ...(record(data.transport) ? { transport: data.transport as types.models.TransportSpec } : {}),
                    ...(optional<boolean>("enabled") !== undefined ? { enabled: data.enabled as boolean } : {}),
                });
                return reply({ connection });
            }
            case "remove": {
                if (data.confirmed !== true) return reply({ error: "Confirm removal before continuing" }, 400);
                return reply(await ctx.fns.models.remove({ id }));
            }
            case "test": return reply({ result: await ctx.fns.models.test({ id }) });
            case "models": return reply(await ctx.fns.models.listModels({ id }));
            case "usage": return reply({ usage: await ctx.fns.models.usage({ id, refresh: data.refresh === true }) });
            case "action": {
                if (typeof data.name !== "string" || !data.name) return reply({ error: "Action name required" }, 400);
                return reply({ result: await ctx.fns.models.action({ id, action: data.name, input: (data.input ?? null) as types.models.ActionValue }) });
            }
            default: return reply({ error: "Unknown action" }, 400);
        }
    } catch (error) { return fail(error); }
}
