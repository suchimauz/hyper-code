/**
 * Set MiniMax admission tier through owner-only cookie-CSRF JSON.
 *
 * JSON object with minimaxCodingServiceTier set to standard or priority. Obsolete output-budget fields are not stored.
 * Native React controls use /llms/settings; this path returns JSON, never HTML or redirects.
 * @param opts.req Authenticated same-origin JSON POST with cookie-bound X-CSRF-Token.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Authenticated same-origin JSON POST with cookie-bound X-CSRF-Token. */
    req: Request;
}): Promise<Response> {
    const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
    const req = opts.req;
    const who = await ctx.fns.auth.currentUser({ req });
    if (who.required && !who.user && !who.legacy) return reply({ error: 'Unauthorized' }, 401);
    if (who.user && who.user.role !== 'owner') return reply({ error: 'Owner required' }, 403);
    if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
    if (req.headers.get('sec-fetch-site') === 'cross-site' || (req.headers.has('origin') && req.headers.get('origin') !== await ctx.fns.http.publicOrigin({ req }))) return reply({ error: 'Same origin required' }, 403);
    if (!await ctx.fns.auth.verifyCsrf({ req, token: req.headers.get('x-csrf-token') || '' })) return reply({ error: 'Invalid request token' }, 403);
    if (req.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') return reply({ error: 'JSON required' }, 415);
    const raw = await req.text();
    if (raw.length > 8192) return reply({ error: 'Request too large' }, 413);
    let data: Record<string, unknown>;
    try { data = JSON.parse(raw); } catch { return reply({ error: 'Invalid JSON' }, 400); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return reply({ error: 'Invalid request' }, 400);
    const tier = data.minimaxCodingServiceTier;
    if (tier !== 'standard' && tier !== 'priority') return reply({ error: 'Invalid tier' }, 400);
    await ctx.fns.settings.set({ module: 'llm', scopeType: 'global', key: 'minimaxCodingServiceTier', value: tier });
    return reply({ ok: true, serviceTier: tier });
}
