/**
 * Validates a literal SSH endpoint without contacting its host
 *
 * Use before persisting endpoints or building OpenSSH arguments to reject option injection and malformed names, hosts and ports.
 * @param opts.name Stable instance identifier, up to 64 ASCII letters, numbers, dots, underscores or hyphens.
 * @param opts.host Literal DNS hostname, IPv4 or unbracketed IPv6 address.
 * @param opts.user Remote login account without whitespace or option syntax.
 * @param opts.port Integer TCP port. @default 22 @minimum 1 @maximum 65535
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Stable instance identifier, up to 64 ASCII letters, numbers, dots, underscores or hyphens. */
        name: string;
        /** Literal DNS hostname, IPv4 or unbracketed IPv6 address. */
        host: string;
        /** Remote login account without whitespace or option syntax. */
        user: string;
        /** Integer TCP port. @default 22 @minimum 1 @maximum 65535 */
        port?: number;
    },
): Promise<{name:string;host:string;user:string;port:number}> {
    const { isIP } = await import('node:net');
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(opts.name)) throw new Error('Invalid instance name');
    if (!(isIP(opts.host) || (opts.host.length <= 253 && opts.host.split('.').every(p => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(p))))) throw new Error('Invalid literal SSH host');
    if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/.test(opts.user)) throw new Error('Invalid SSH user');
    const port = opts.port ?? 22;
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SSH port');
    return {name:opts.name,host:opts.host,user:opts.user,port};
}
