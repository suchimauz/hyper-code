/**
 * Compute a deterministic opaque ID for an exact normalized workspace tuple.
 *
 * Pure lexical identity for discovery without filesystem access. Rejects relative paths; does not resolve symlinks or modify workspaces.
 * @param opts.dir Absolute workspace directory.
 * @param opts.host SSH alias, empty or local means local.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Absolute workspace directory. */
        dir: string;
        /** SSH alias, empty or local means local. */
        host?: string;
    },
): Promise<{id:string;dir:string;host:string}> {
    const path = await import('node:path');
    const host = (opts.host ?? '').trim();
    const normalizedHost = host === 'local' ? '' : host;
    if (!opts.dir.startsWith('/') || opts.dir.includes('\0') || /[\r\n\0]/.test(normalizedHost)) throw new Error('Invalid workspace identity');
    const dir = path.posix.normalize(opts.dir).replace(/\/$/, '') || '/';
    const hash = new Bun.CryptoHasher('sha256').update(JSON.stringify([normalizedHost,dir])).digest('hex');
    return {id: 'p_' + hash, dir, host: normalizedHost};
}
