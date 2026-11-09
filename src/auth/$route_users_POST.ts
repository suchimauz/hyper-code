/**
 * Handles the People page forms (owners only): add a person, disable/enable, change role, and
 * edit your own name, email and password. JSON clients receive a result; forms redirect.
 * @param opts.req Authenticated JSON or form request with cookie-bound CSRF token.
 * @param opts.params Route parameters (unused).
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const me = (session as any)?.user as types.auth.User | undefined;
    if (!me || me.role !== "owner") return new Response("Only owners can manage people", { status: 403 });
    const json = opts.req.headers.get('accept')?.includes('application/json');
    let values: unknown;
    try { values = opts.req.headers.get('content-type')?.includes('application/json') ? await opts.req.json() : Object.fromEntries(await opts.req.formData()); }
    catch { return Response.json({error:'Invalid request body'}, {status:400}); }
    if (!values || typeof values !== 'object' || Array.isArray(values)) return Response.json({error:'Invalid request body'}, {status:400});
    const fields = values as Record<string, unknown>;
    const get = (k: string) => typeof fields[k] === 'string' ? (fields[k] as string).trim() : '';
    if (!await ctx.fns.auth.verifyCsrf({req:opts.req,token:opts.req.headers.get('x-csrf-token') || get('_csrf')})) return Response.json({error:'CSRF verification failed'}, {status:403});
    const back = (key: "ok" | "error", message: string) =>
        json ? Response.json({[key]:message}, {status:key==='error'?400:200,headers:{'cache-control':'no-store'}}) : new Response(null, { status: 303, headers: { location: `/?view=people&${key}=${encodeURIComponent(message)}`, "cache-control": "no-store" } });
    try {
        if (get('id') === me.id && ['disable','role'].includes(get('action'))) return back('error', 'Use another owner to change your access');
        switch (get("action")) {
            case "add": {
                const google = await ctx.fns.auth.googleConfig({});
                const password = get("password") || null;
                if (!password && !google) return back("error", "Password is required (Google sign-in is off)");
                // With Google on, a person may be added without a password: they sign in with Google.
                const user = password
                    ? await ctx.fns.auth.createUser({ name: get("name"), email: get("email"), password })
                    : await ctx.fns.auth.createUser({ name: get("name"), email: get("email"), password: null, allowNoPassword: true });
                return back("ok", `Added ${user.name}`);
            }
            case "disable": await ctx.fns.auth.setUserDisabled({ id: get("id"), disabled: true }); return back("ok", "Disabled");
            case "enable": await ctx.fns.auth.setUserDisabled({ id: get("id"), disabled: false }); return back("ok", "Enabled");
            case "role": await ctx.fns.auth.updateUser({ id: get("id"), role: get("role") === "owner" ? "owner" : "member" }); return back("ok", "Role changed");
            case "me": {
                await ctx.fns.auth.updateUser({ id: me.id, name: get("name"), email: get("email") || null, ...(get("password") ? { password: get("password") } : {}) });
                return back("ok", "Saved");
            }
            default: return back("error", "Unknown action");
        }
    } catch (e) {
        return back("error", String((e as Error).message).replace(/^auth\.\w+: /, ""));
    }
}
