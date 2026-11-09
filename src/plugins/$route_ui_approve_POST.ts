/**
 * Owner-only, CSRF-protected human approval (or revocation) of one plugin UI bundle hash.
 * @param opts.req JSON body { name, hash, revoke? } from the Plugins page.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** JSON body { name, hash, revoke? } from the Plugins page. */ req: Request;
}): Promise<Response> {
    const req = opts.req;
    const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Vary': 'Cookie' } });
    const who = await ctx.fns.auth.currentUser({ req });
    if (who.required && !who.user && !who.legacy) return reply({ error: 'Unauthorized' }, 401);
    if (who.user && who.user.role !== 'owner') return reply({ error: 'Owner access required' }, 403);
    if (req.headers.get('sec-fetch-site') === 'cross-site' || (req.headers.has('origin') && req.headers.get('origin') !== await ctx.fns.http.publicOrigin({ req }))) return reply({ error: 'Same origin required' }, 403);
    if (!await ctx.fns.auth.verifyCsrf({ req, token: req.headers.get('x-csrf-token') ?? '' })) return reply({ error: 'Invalid request token' }, 403);
    if (req.headers.get('content-type')?.split(';')[0] !== 'application/json') return reply({ error: 'JSON required' }, 415);
    const raw = await req.text(); if (raw.length > 4096) return reply({ error: 'Request too large' }, 413);
    let body: { name?: unknown; hash?: unknown; revoke?: unknown };
    try { body = JSON.parse(raw); } catch { return reply({ error: 'Invalid JSON' }, 400); }
    if (!body || typeof body !== 'object' || Object.keys(body).some(k => !['name', 'hash', 'revoke'].includes(k)) || typeof body.name !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(body.name) || typeof body.hash !== 'string' || !/^[0-9a-f]{16}$/.test(body.hash) || (body.revoke !== undefined && typeof body.revoke !== 'boolean')) return reply({ error: 'Invalid fields' }, 400);
    try { return reply(await ctx.fns.plugins.uiApprove({ name: body.name, hash: body.hash, revoke: body.revoke === true, approvedBy: who.user?.id })); }
    catch (e) { return reply({ error: e instanceof Error ? e.message : 'Approval failed' }, 409); }
}
