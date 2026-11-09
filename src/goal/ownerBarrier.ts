/**
 * Reserve one local owner accounting boundary, optionally waiting for it like Codex's goal state permit
 *
 * Internal dispatch and explicit mutation coordination only. Acquire before asynchronous accounting work and release in finally with the exact opaque lease reference. Without `wait` an occupied boundary returns null at once. With `wait` the caller queues FIFO without a timeout, exactly like the Codex goal_state_lock semaphore: release hands the lease straight to the oldest waiter. Holders keep it only around accounting/status boundaries, so waits stay short. Holds no database lock. State is process-local; running mutation requires the matching local run registry.
 * @param opts.agentId Immutable source owner identity.
 * @param opts.runToken Captured owner claim; null only for idle mutation.
 * @param opts.action Acquire or compare-release a reservation.
 * @param opts.lease Exact reservation reference returned by acquire; required for release.
 * @param opts.wait Queue until the boundary is free instead of returning null. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Immutable source owner identity. */
        agentId: string;
        /** Captured owner claim; null only for idle mutation. */
        runToken: string | null;
        /** Acquire or compare-release a reservation. */
        action: "acquire" | "release";
        /** Exact reservation reference returned by acquire; required for release. */
        lease?: Readonly<{ agentId: string; runToken: string | null }>;
        /** Queue until the boundary is free instead of returning null. @default false */
        wait?: boolean;
    },
): Promise<Readonly<{ agentId: string; runToken: string | null }> | null> {
    type Lease = Readonly<{agentId:string;runToken:string|null}>;
    const holder = ctx.state as typeof ctx.state & { goalOwnerBarriers?: Map<string, Lease>; goalOwnerWaiters?: Map<string, Array<{runToken:string|null;resolve:(lease:Lease)=>void}>> };
    const barriers = holder.goalOwnerBarriers ??= new Map();
    const waiters = holder.goalOwnerWaiters ??= new Map();
    if (!opts.agentId || (opts.runToken !== null && !opts.runToken)) throw new Error('Invalid barrier owner');
    if (opts.action === 'release') {
     const lease=opts.lease;
     if (!lease || lease.agentId!==opts.agentId || lease.runToken!==opts.runToken || barriers.get(opts.agentId)!==lease) throw new Error('Goal barrier lease mismatch');
     barriers.delete(opts.agentId);
     const queue=waiters.get(opts.agentId);const next=queue?.shift();
     if (queue && !queue.length) waiters.delete(opts.agentId);
     if (next) { const handed=Object.freeze({agentId:opts.agentId,runToken:next.runToken});barriers.set(opts.agentId,handed);next.resolve(handed); }
     return null;
    }
    if (barriers.has(opts.agentId)) {
     if (!opts.wait) return null;
     return await new Promise<Lease>(resolve => { const queue=waiters.get(opts.agentId) ?? [];queue.push({runToken:opts.runToken,resolve});waiters.set(opts.agentId,queue); });
    }
    const lease=Object.freeze({agentId:opts.agentId,runToken:opts.runToken});barriers.set(opts.agentId,lease);return lease;
}
