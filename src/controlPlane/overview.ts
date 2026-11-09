/**
 * Return a secret-free instance directory for the native React page.
 *
 * Use for authenticated read-only instance discovery. Projects only public display fields and never returns control-plane credentials or arbitrary metadata. Does not change deployment or configuration.
 * @param opts.req Incoming GET request; other methods are rejected.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming GET request; other methods are rejected. */
        req: Request;
    },
): Promise<Response> {
    const headers = { 'Cache-Control': 'no-store', Vary: 'Cookie' };
    const reply = (body: object, status = 200) => Response.json(body, { status, headers });
    if (!(session as Session & { user?: { id: string } })?.user) return reply({ error: 'Unauthorized' }, 401);
    if (opts.req.method !== 'GET') return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET' } });
    try {
     const cfg = await ctx.fns.auth.oidcConfig({});
     if (!cfg) return reply({ connected: false, instances: [] });
     const services = await ctx.fns.controlPlane.services({ kind: 'hyper' });
     const safeUrl = (value: string) => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.origin + url.pathname : null; } catch { return null; } };
     const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
     return reply({ connected: true, issuer: safeUrl(cfg.issuer), instances: services.map(s => ({ id: String(s.id), name: String(s.name), url: safeUrl(s.url), ownerEmail: typeof s.ownerEmail === 'string' ? s.ownerEmail : null, users: count(s.metadata?.users), agents: count(s.metadata?.agents), running: count(s.metadata?.running), version: typeof s.metadata?.version === 'string' ? s.metadata.version : null, lastSeenAt: typeof s.lastSeenAt === 'number' && Number.isFinite(s.lastSeenAt) && Math.abs(s.lastSeenAt) <= 8.64e15 ? s.lastSeenAt : null })) });
    } catch { return reply({ error: 'Unable to load instances' }, 502); }
}
