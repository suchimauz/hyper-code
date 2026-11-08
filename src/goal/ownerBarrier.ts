/**
 * Try to reserve one local owner accounting boundary without waiting
 *
 * Internal dispatch and explicit mutation coordination only. Acquire synchronously before asynchronous work and release in finally with the exact opaque lease reference. Holds no database lock and never waits for a provider. State is process-local; running mutation requires the matching local run registry.
 * @param opts.agentId Immutable source owner identity.
 * @param opts.runToken Captured owner claim; null only for idle mutation.
 * @param opts.action Try acquire or compare-release a reservation.
 * @param opts.lease Exact reservation reference returned by acquire; required for release.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Immutable source owner identity. */
        agentId: string;
        /** Captured owner claim; null only for idle mutation. */
        runToken: string | null;
        /** Try acquire or compare-release a reservation. */
        action: "acquire" | "release";
        /** Exact reservation reference returned by acquire; required for release. */
        lease?: Readonly<{ agentId: string; runToken: string | null }>;
    },
): Promise<Readonly<{ agentId: string; runToken: string | null }> | null> {
    const holder = ctx.state as typeof ctx.state & { goalOwnerBarriers?: Map<string, Readonly<{agentId:string;runToken:string|null}>> };
    const barriers = holder.goalOwnerBarriers ??= new Map();
    if (!opts.agentId || (opts.runToken !== null && !opts.runToken)) throw new Error('Invalid barrier owner');
    if (opts.action === 'release') {
     const lease=opts.lease;
     if (!lease || lease.agentId!==opts.agentId || lease.runToken!==opts.runToken || barriers.get(opts.agentId)!==lease) throw new Error('Goal barrier lease mismatch');
     barriers.delete(opts.agentId); return null;
    }
    if (barriers.has(opts.agentId)) return null;
    const lease=Object.freeze({agentId:opts.agentId,runToken:opts.runToken});barriers.set(opts.agentId,lease);return lease;
}
