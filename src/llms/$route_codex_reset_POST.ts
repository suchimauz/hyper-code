/** Redeem a finite Codex reset credit through an owner-only, confirmed JSON request.
 * Rejects legacy HTML forms. Requires cookie-bound CSRF and a stable retry key; never resets on a read.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Authenticated same-origin JSON POST with account, optional creditId, confirmed:true and idempotencyKey. */
    req: Request;
}): Promise<Response> {
    const req = opts.req;
    const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
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
    if (data.confirmed !== true) return reply({ error: 'Explicit confirmation required' }, 400);
    if (typeof data.account !== 'string' || !data.account.trim() || data.account.length > 256 || typeof data.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(data.idempotencyKey) || (data.creditId !== undefined && (typeof data.creditId !== 'string' || !data.creditId || data.creditId.length > 1024))) return reply({ error: 'Invalid account, credit or retry key' }, 400);
    try {
        const result = await ctx.fns.llm.consumeResetCredit({ account: data.account, creditId: data.creditId as string | undefined, idempotencyKey: data.idempotencyKey });
        for (const topic of ['llm-usage', 'llm-accounts']) ctx.fns.procs.events.refresh({ topic, reason: 'codex reset' });
        return reply(result);
    } catch {
        return reply({ error: 'Reset failed; retry with the same idempotency key' }, 400);
    }
}
