/**
 * Validate a provider transport and its saved reference
 *
 * Use before saving a model connection. Reject unsupported kinds, missing saved proxies and SSH instances without a pinned host key; never open a network connection or decrypt credentials.
 * @param opts.transport Transport selection with its saved proxy or SSH reference.
 * @param opts.allowed Allowed transports declared by the selected provider.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Transport selection with its saved proxy or SSH reference. */
        transport: types.models.TransportSpec;
        /** Allowed transports declared by the selected provider. */
        allowed: types.models.TransportSpec["kind"][];
    },
): Promise<void> {
    const t = opts.transport;
    const fail = (message: string): never => { throw Object.assign(new Error(message), {code: 'TRANSPORT'}); };
    if (!t || !['direct', 'socks', 'ssh-tunnel'].includes(t.kind) || !opts.allowed.includes(t.kind)) fail('Transport not allowed by provider');
    if (t.kind === 'socks') {
     if (typeof t.proxyId !== 'string' || !t.proxyId.trim()) fail('Missing proxy reference');
     await ctx.fns.socksProxy.validateIdentity({id: t.proxyId});
     const rows = await ctx.fns.procs.db.select({sql: 'SELECT id FROM socks_proxies WHERE id=?', params: [t.proxyId]});
     if (!rows.length) fail('Proxy not found');
    }
    if (t.kind === 'ssh-tunnel') {
     if (typeof t.instance !== 'string' || !t.instance.trim()) fail('Missing SSH instance');
     const instance = await ctx.fns.sshInstance.get({name: t.instance});
     if (!instance.pinnedHostKey) fail('SSH instance has no pinned host key');
    }
}
